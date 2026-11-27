-- ACE BAR GAME ROOM: protect verification hashes and expose only safe room data.
-- Safe to run after game-room.sql; does not touch orders or other bar tables.
alter table public.game_rooms enable row level security;
alter table public.game_players enable row level security;
alter table public.game_rounds enable row level security;

drop policy if exists "Public can view game rooms" on public.game_rooms;
drop policy if exists "Public can view game players" on public.game_players;
drop policy if exists "Public can view game rounds" on public.game_rounds;

revoke all on table public.game_rooms from anon, authenticated;
revoke all on table public.game_players from anon, authenticated;
revoke all on table public.game_rounds from anon, authenticated;

create or replace function public.game_list_waiting_rooms()
returns jsonb language sql security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'code',code,'host_name',host_name,'game_type',game_type,
    'max_players',max_players,'created_at',created_at
  ) order by created_at desc),'[]'::jsonb)
  from (select * from public.game_rooms where status='waiting' order by created_at desc limit 20) rooms;
$$;

create or replace function public.game_get_room(p_room uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.game_rooms;
begin
  select * into r from public.game_rooms where id=p_room;
  if not found then return jsonb_build_object('room',null,'players','[]'::jsonb,'rounds','[]'::jsonb); end if;
  return jsonb_build_object(
    'room',jsonb_build_object(
      'id',r.id,'code',r.code,'host_name',r.host_name,'game_type',r.game_type,
      'status',r.status,'max_players',r.max_players,'game_state',r.game_state,'created_at',r.created_at
    ),
    'players',coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'display_name',p.display_name,'role',p.role,'score',p.score,'joined_at',p.joined_at
    ) order by p.joined_at) from public.game_players p where p.room_id=p_room),'[]'::jsonb),
    'rounds',coalesce((select jsonb_agg(jsonb_build_object(
      'id',g.id,'round_number',g.round_number,'game_type',g.game_type,'result',g.result,'created_at',g.created_at
    ) order by g.created_at desc) from (select * from public.game_rounds where room_id=p_room order by created_at desc limit 20) g),'[]'::jsonb)
  );
end $$;

revoke all on function public.game_list_waiting_rooms() from public;
revoke all on function public.game_get_room(uuid) from public;
grant execute on function public.game_list_waiting_rooms() to anon,authenticated;
grant execute on function public.game_get_room(uuid) to anon,authenticated;
