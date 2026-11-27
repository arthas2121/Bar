-- Fix pgcrypto function lookup for Game Room RPCs on Supabase.
-- Supabase commonly installs pgcrypto in the extensions schema.
alter function public.game_create_room(text,text,integer) set search_path = public, extensions;
alter function public.game_join_room(text,text) set search_path = public, extensions;
alter function public.game_host_start(uuid,text) set search_path = public, extensions;
alter function public.game_play_round(uuid,text,text,text) set search_path = public, extensions;
alter function public.game_host_finish(uuid,text) set search_path = public, extensions;
