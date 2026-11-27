-- ACE BAR GAME ROOM
create extension if not exists pgcrypto;

create table if not exists public.game_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_token_hash text not null,
  host_name text not null,
  game_type text not null check (game_type in ('liars_dice','high_low','higher_lower','red_black','kings_cup','dare_or_drink')),
  status text not null default 'waiting' check (status in ('waiting','playing','finished')),
  max_players integer not null default 8 check (max_players between 2 and 12),
  game_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.game_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  player_token_hash text not null,
  display_name text not null,
  role text not null default 'player' check (role in ('host','player')),
  score integer not null default 0,
  joined_at timestamptz not null default now(),
  unique(room_id, player_token_hash)
);
create table if not exists public.game_rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  round_number integer not null,
  game_type text not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.game_rooms enable row level security;
alter table public.game_players enable row level security;
alter table public.game_rounds enable row level security;

drop policy if exists "Public can view game rooms" on public.game_rooms;
create policy "Public can view game rooms" on public.game_rooms for select to anon, authenticated using (true);
drop policy if exists "Public can view game players" on public.game_players;
create policy "Public can view game players" on public.game_players for select to anon, authenticated using (true);
drop policy if exists "Public can view game rounds" on public.game_rounds;
create policy "Public can view game rounds" on public.game_rounds for select to anon, authenticated using (true);

create or replace function public.game_create_room(p_name text,p_game text,p_max integer default 8)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.game_rooms; pt text:=encode(gen_random_bytes(24),'hex'); ht text:=encode(gen_random_bytes(24),'hex'); c text;
begin
 if length(trim(p_name)) not between 1 and 40 then raise exception 'Please enter a name'; end if;
 if p_game not in ('liars_dice','high_low','higher_lower','red_black','kings_cup','dare_or_drink') then raise exception 'Invalid game'; end if;
 if p_max not between 2 and 12 then raise exception 'Player limit must be 2–12'; end if;
 c:=upper(substr(encode(gen_random_bytes(5),'hex'),1,6));
 insert into game_rooms(code,host_token_hash,host_name,game_type,max_players) values(c,encode(digest(ht,'sha256'),'hex'),trim(p_name),p_game,p_max) returning * into r;
 insert into game_players(room_id,player_token_hash,display_name,role) values(r.id,encode(digest(pt,'sha256'),'hex'),trim(p_name),'host');
 return jsonb_build_object('room_id',r.id,'code',r.code,'player_token',pt,'host_token',ht);
end $$;

create or replace function public.game_join_room(p_code text,p_name text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.game_rooms; pt text:=encode(gen_random_bytes(24),'hex'); pid uuid;
begin
 select * into r from game_rooms where code=upper(trim(p_code)) and status='waiting' for update;
 if not found then raise exception 'Room not found or game already started'; end if;
 if (select count(*) from game_players where room_id=r.id)>=r.max_players then raise exception 'Room is full'; end if;
 if length(trim(p_name)) not between 1 and 40 then raise exception 'Please enter a name'; end if;
 insert into game_players(room_id,player_token_hash,display_name) values(r.id,encode(digest(pt,'sha256'),'hex'),trim(p_name)) returning id into pid;
 return jsonb_build_object('room_id',r.id,'player_id',pid,'player_token',pt,'host_token',null);
end $$;

create or replace function public.game_host_start(p_room uuid,p_token text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r game_rooms;
begin
 select * into r from game_rooms where id=p_room for update;
 if not found or r.host_token_hash<>encode(digest(p_token,'sha256'),'hex') then raise exception 'Only the host can start this game'; end if;
 if (select count(*) from game_players where room_id=p_room)<2 then raise exception 'At least two players are required'; end if;
 update game_rooms set status='playing',game_state=jsonb_build_object('round',1,'current_turn',0,'scores',jsonb_build_object()) where id=p_room;
 return jsonb_build_object('ok',true);
end $$;

create or replace function public.game_play_round(p_room uuid,p_token text,p_action text,p_guess text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r game_rooms; p game_players; result jsonb; val integer; deck text[]:=array['A','2','3','4','5','6','7','8','9','10','J','Q','K']; card text; nextcard text; correct boolean; delta integer:=0; roundno integer;
begin
 select * into r from game_rooms where id=p_room for update;
 if not found or r.status<>'playing' then raise exception 'Game is not active'; end if;
 select * into p from game_players where room_id=p_room and player_token_hash=encode(digest(p_token,'sha256'),'hex');
 if not found then raise exception 'Player not found'; end if;
 roundno:=coalesce((r.game_state->>'round')::integer,1);
 if r.game_type in ('liars_dice','high_low') then
   val:=1+floor(random()*6)::integer;
   result:=jsonb_build_object('player',p.display_name,'dice',array[val,1+floor(random()*6)::integer,1+floor(random()*6)::integer],'message','Dice rolled');
   delta:=case when val>=4 then 1 else 0 end;
 elsif r.game_type in ('higher_lower','red_black') then
   card:=deck[1+floor(random()*13)::integer];
   nextcard:=deck[1+floor(random()*13)::integer];
   correct:=case when r.game_type='red_black' then (p_guess='red' and nextcard in ('2','4','6','8','10','Q')) or (p_guess='black' and nextcard in ('A','3','5','7','9','J','K')) else (p_guess='higher' and array_position(deck,nextcard)>array_position(deck,card)) or (p_guess='lower' and array_position(deck,nextcard)<array_position(deck,card)) end;
   delta:=case when correct then 1 else 0 end;
   result:=jsonb_build_object('player',p.display_name,'first_card',card,'next_card',nextcard,'guess',p_guess,'correct',correct);
 elsif r.game_type='kings_cup' then
   val:=1+floor(random()*13)::integer;
   result:=jsonb_build_object('player',p.display_name,'card',deck[val],'prompt',case val when 1 then 'Ace: Everyone points to a player' when 11 then 'Jack: Make a fun rule' when 12 then 'Queen: Ask a question' when 13 then 'King: Group challenge' else 'Number card: Share a fun story' end);
 else
   val:=1+floor(random()*6)::integer;
   result:=jsonb_build_object('player',p.display_name,'challenge',case val when 1 then 'Tell a funny story' when 2 then 'Do your best celebrity impression' when 3 then 'Give someone a genuine compliment' when 4 then 'Invent a cocktail name' when 5 then 'Share an unusual fact about yourself' else 'Let the group choose a harmless challenge' end);
 end if;
 update game_players set score=score+delta where id=p.id;
 insert into game_rounds(room_id,round_number,game_type,result) values(p_room,roundno,r.game_type,result);
 update game_rooms set game_state=jsonb_build_object('round',roundno+1,'last_result',result,'last_player_id',p.id) where id=p_room;
 return result||jsonb_build_object('points_earned',delta,'round',roundno);
end $$;

create or replace function public.game_host_finish(p_room uuid,p_token text)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from game_rooms where id=p_room and host_token_hash=encode(digest(p_token,'sha256'),'hex')) then raise exception 'Only the host can finish this game'; end if;
 update game_rooms set status='finished' where id=p_room;
 return jsonb_build_object('ok',true);
end $$;

grant execute on function public.game_create_room(text,text,integer) to anon,authenticated;
grant execute on function public.game_join_room(text,text) to anon,authenticated;
grant execute on function public.game_host_start(uuid,text) to anon,authenticated;
grant execute on function public.game_play_round(uuid,text,text,text) to anon,authenticated;
grant execute on function public.game_host_finish(uuid,text) to anon,authenticated;

do $$ begin
 alter publication supabase_realtime add table public.game_rooms;
exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin
 alter publication supabase_realtime add table public.game_players;
exception when duplicate_object then null; when duplicate_table then null; end $$;
do $$ begin
 alter publication supabase_realtime add table public.game_rounds;
exception when duplicate_object then null; when duplicate_table then null; end $$;
