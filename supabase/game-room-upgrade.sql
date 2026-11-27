-- ACE BAR GAME ROOM UPGRADE: private dice + turn-based Liar's Dice.
-- Run once in Supabase SQL Editor after the existing Game Room setup.
create extension if not exists pgcrypto with schema extensions;

alter table public.game_rooms enable row level security;
alter table public.game_players enable row level security;
alter table public.game_rounds enable row level security;
drop policy if exists "Public can view game rooms" on public.game_rooms;
drop policy if exists "Public can view game players" on public.game_players;
drop policy if exists "Public can view game rounds" on public.game_rounds;
revoke all on table public.game_rooms, public.game_players, public.game_rounds from anon, authenticated;

create table if not exists public.game_player_private (
  player_id uuid primary key references public.game_players(id) on delete cascade,
  dice integer[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.game_player_private enable row level security;
revoke all on table public.game_player_private from anon, authenticated;

create or replace function public.game_list_waiting_rooms()
returns jsonb language sql security definer set search_path=public,extensions as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'code',code,'host_name',host_name,'game_type',game_type,'max_players',max_players,'created_at',created_at) order by created_at desc),'[]'::jsonb)
 from (select * from public.game_rooms where status='waiting' order by created_at desc limit 20) q;
$$;

drop function if exists public.game_get_room(uuid);
create or replace function public.game_get_room(p_room uuid,p_token text default null)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare r public.game_rooms; pid uuid; mydice integer[];
begin
 select * into r from public.game_rooms where id=p_room;
 if not found then return jsonb_build_object('room',null,'players','[]'::jsonb,'rounds','[]'::jsonb); end if;
 if p_token is not null then
   select id into pid from public.game_players where room_id=p_room and player_token_hash=encode(digest(p_token,'sha256'),'hex');
   if pid is not null then select dice into mydice from public.game_player_private where player_id=pid; end if;
 end if;
 return jsonb_build_object(
  'room',jsonb_build_object('id',r.id,'code',r.code,'host_name',r.host_name,'game_type',r.game_type,'status',r.status,'max_players',r.max_players,'game_state',r.game_state,'created_at',r.created_at),
  'player_id',pid,'my_dice',coalesce(to_jsonb(mydice),'[]'::jsonb),
  'players',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'display_name',p.display_name,'role',p.role,'score',p.score,'joined_at',p.joined_at) order by p.joined_at,p.id) from public.game_players p where p.room_id=p_room),'[]'::jsonb),
  'rounds',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'round_number',g.round_number,'game_type',g.game_type,'result',g.result,'created_at',g.created_at) order by g.created_at desc) from (select * from public.game_rounds where room_id=p_room order by created_at desc limit 20) g),'[]'::jsonb)
 );
end $$;

create or replace function public.game_create_room(p_name text,p_game text,p_max integer default 8)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare r public.game_rooms; pt text:=encode(gen_random_bytes(24),'hex'); ht text:=encode(gen_random_bytes(24),'hex'); c text; pid uuid;
begin
 if length(trim(p_name)) not between 1 and 40 then raise exception 'Please enter a name'; end if;
 if p_game not in ('liars_dice','high_low','higher_lower','red_black','kings_cup','dare_or_drink') then raise exception 'Invalid game'; end if;
 if p_max not between 2 and 12 then raise exception 'Player limit must be 2–12'; end if;
 c:=upper(substr(encode(gen_random_bytes(5),'hex'),1,6));
 insert into public.game_rooms(code,host_token_hash,host_name,game_type,max_players) values(c,encode(digest(ht,'sha256'),'hex'),trim(p_name),p_game,p_max) returning * into r;
 insert into public.game_players(room_id,player_token_hash,display_name,role) values(r.id,encode(digest(pt,'sha256'),'hex'),trim(p_name),'host') returning id into pid;
 return jsonb_build_object('room_id',r.id,'player_id',pid,'code',r.code,'player_token',pt,'host_token',ht);
end $$;

create or replace function public.game_host_start(p_room uuid,p_token text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare r public.game_rooms; p record; n integer:=0; d integer[];
begin
 select * into r from public.game_rooms where id=p_room for update;
 if not found or r.host_token_hash<>encode(digest(p_token,'sha256'),'hex') then raise exception 'Only the host can start this game'; end if;
 if r.status<>'waiting' then raise exception 'Game has already started'; end if;
 if (select count(*) from public.game_players where room_id=p_room)<2 then raise exception 'At least two players are required'; end if;
 if r.game_type='liars_dice' then
  for p in select id from public.game_players where room_id=p_room order by joined_at,id loop
   d:=array[]::integer[];
   for i in 1..5 loop d:=array_append(d,1+floor(random()*6)::integer); end loop;
   insert into public.game_player_private(player_id,dice) values(p.id,d) on conflict(player_id) do update set dice=excluded.dice,updated_at=now();
  end loop;
 end if;
 update public.game_rooms set status='playing',game_state=jsonb_build_object('round',1,'current_turn',0,'bid',null,'last_result',null) where id=p_room;
 return jsonb_build_object('ok',true);
end $$;

create or replace function public.game_play_round(p_room uuid,p_token text,p_action text,p_guess text default null)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare r public.game_rooms; p public.game_players; players_count integer; turn_index integer; my_index integer; bid jsonb; newbid jsonb; actual integer:=0; bidder_id uuid; bidder_name text; challenger_name text; winner_id uuid; delta integer:=1; reveal jsonb; result jsonb; roundno integer; d integer[]; rec record; val integer; deck text[]:=array['A','2','3','4','5','6','7','8','9','10','J','Q','K']; card text; nextcard text; correct boolean;
begin
 select * into r from public.game_rooms where id=p_room for update;
 if not found or r.status<>'playing' then raise exception 'Game is not active'; end if;
 select * into p from public.game_players where room_id=p_room and player_token_hash=encode(digest(p_token,'sha256'),'hex');
 if not found then raise exception 'Player not found'; end if;
 roundno:=coalesce((r.game_state->>'round')::integer,1);
 if r.game_type='liars_dice' then
  select count(*) into players_count from public.game_players where room_id=p_room;
  select count(*) into my_index from (select id,row_number() over(order by joined_at,id)-1 idx from public.game_players where room_id=p_room) q where q.id=p.id and q.idx=coalesce((r.game_state->>'current_turn')::integer,0);
  if my_index=0 then raise exception 'It is not your turn'; end if;
  bid:=r.game_state->'bid';
  if p_action='bid' then
   begin newbid:=p_guess::jsonb; exception when others then raise exception 'Enter a valid bid'; end;
   if coalesce((newbid->>'count')::integer,0)<1 or coalesce((newbid->>'count')::integer,0)>players_count*5 or coalesce((newbid->>'face')::integer,0) not between 1 and 6 then raise exception 'Bid must be within the dice and face limits'; end if;
   if bid is not null and not ((newbid->>'count')::integer>(bid->>'count')::integer or ((newbid->>'count')::integer=(bid->>'count')::integer and (newbid->>'face')::integer>(bid->>'face')::integer)) then raise exception 'Your bid must be higher than the previous bid'; end if;
   newbid:=newbid||jsonb_build_object('player_id',p.id);
   update public.game_rooms set game_state=game_state||jsonb_build_object('bid',newbid,'current_turn',((coalesce((game_state->>'current_turn')::integer,0)+1)%players_count)) where id=p_room;
   return jsonb_build_object('type','bid','bid',newbid,'player_id',p.id,'player_name',p.display_name,'next_turn',(coalesce((r.game_state->>'current_turn')::integer,0)+1)%players_count);
  elsif p_action='challenge' then
   if bid is null then raise exception 'There is no bid to challenge'; end if;
   for rec in select gp.id,gp.display_name,gpd.dice from public.game_players gp join public.game_player_private gpd on gpd.player_id=gp.id where gp.room_id=p_room order by gp.joined_at,gp.id loop
    actual:=actual+(select count(*) from unnest(rec.dice) x where x=(bid->>'face')::integer);
    reveal:=coalesce(reveal,'[]'::jsonb)||jsonb_build_array(jsonb_build_object('player',rec.display_name,'dice',rec.dice));
   end loop;
   select id,display_name into bidder_id,bidder_name from public.game_players where room_id=p_room and id=(bid->>'player_id')::uuid;
   challenger_name:=p.display_name;
   winner_id:=case when actual >= (bid->>'count')::integer then bidder_id else p.id end;
   update public.game_players set score=score+1 where id=winner_id;
   result:=jsonb_build_object('type','challenge','bid',bid,'actual_count',actual,'challenger',challenger_name,'bidder',bidder_name,'winner',case when winner_id=bidder_id then bidder_name else challenger_name end,'winner_id',winner_id,'revealed_dice',reveal);
   insert into public.game_rounds(room_id,round_number,game_type,result) values(p_room,roundno,r.game_type,result);
   for rec in select id from public.game_players where room_id=p_room loop
    d:=array[]::integer[]; for i in 1..5 loop d:=array_append(d,1+floor(random()*6)::integer); end loop;
    update public.game_player_private set dice=d,updated_at=now() where player_id=rec.id;
   end loop;
   update public.game_rooms set game_state=jsonb_build_object('round',roundno+1,'current_turn',0,'bid',null,'last_result',result) where id=p_room;
   return result;
  else raise exception 'Choose a bid or challenge'; end if;
 end if;
 if r.game_type in ('higher_lower','red_black') then
  card:=deck[1+floor(random()*13)::integer]; nextcard:=deck[1+floor(random()*13)::integer];
  correct:=case when r.game_type='red_black' then (p_guess='red' and nextcard in ('2','4','6','8','10','Q')) or (p_guess='black' and nextcard in ('A','3','5','7','9','J','K')) else (p_guess='higher' and array_position(deck,nextcard)>array_position(deck,card)) or (p_guess='lower' and array_position(deck,nextcard)<array_position(deck,card)) end;
  result:=jsonb_build_object('player',p.display_name,'first_card',card,'next_card',nextcard,'guess',p_guess,'correct',correct);
 elsif r.game_type='high_low' then
  val:=1+floor(random()*6)::integer; result:=jsonb_build_object('player',p.display_name,'roll',val,'message','You rolled a die');
 elsif r.game_type='kings_cup' then
  val:=1+floor(random()*13)::integer; result:=jsonb_build_object('player',p.display_name,'card',deck[val],'prompt',case val when 1 then 'Ace: Everyone points to a player' when 11 then 'Jack: Make a fun rule' when 12 then 'Queen: Ask a question' when 13 then 'King: Group challenge' else 'Number card: Share a fun story' end);
 else
  val:=1+floor(random()*6)::integer; result:=jsonb_build_object('player',p.display_name,'challenge',case val when 1 then 'Tell a funny story' when 2 then 'Do your best celebrity impression' when 3 then 'Give someone a genuine compliment' when 4 then 'Invent a cocktail name' when 5 then 'Share an unusual fact about yourself' else 'Let the group choose a harmless challenge' end);
 end if;
 delta:=case when coalesce((result->>'correct')::boolean,false) then 1 else 0 end;
 update public.game_players set score=score+delta where id=p.id;
 insert into public.game_rounds(room_id,round_number,game_type,result) values(p_room,roundno,r.game_type,result);
 update public.game_rooms set game_state=game_state||jsonb_build_object('round',roundno+1,'last_result',result) where id=p_room;
 return result||jsonb_build_object('points_earned',delta,'round',roundno);
end $$;

create or replace function public.game_host_finish(p_room uuid,p_token text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
begin
 if not exists(select 1 from public.game_rooms where id=p_room and host_token_hash=encode(digest(p_token,'sha256'),'hex')) then raise exception 'Only the host can finish this game'; end if;
 update public.game_rooms set status='finished' where id=p_room;
 return jsonb_build_object('ok',true);
end $$;

revoke all on function public.game_list_waiting_rooms() from public;
revoke all on function public.game_get_room(uuid,text) from public;
revoke all on function public.game_create_room(text,text,integer) from public;
revoke all on function public.game_join_room(text,text) from public;
revoke all on function public.game_host_start(uuid,text) from public;
revoke all on function public.game_play_round(uuid,text,text,text) from public;
revoke all on function public.game_host_finish(uuid,text) from public;
grant execute on function public.game_list_waiting_rooms() to anon,authenticated;
grant execute on function public.game_get_room(uuid,text) to anon,authenticated;
grant execute on function public.game_create_room(text,text,integer) to anon,authenticated;
grant execute on function public.game_join_room(text,text) to anon,authenticated;
grant execute on function public.game_host_start(uuid,text) to anon,authenticated;
grant execute on function public.game_play_round(uuid,text,text,text) to anon,authenticated;
grant execute on function public.game_host_finish(uuid,text) to anon,authenticated;
