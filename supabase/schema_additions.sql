-- Run this against your existing Supabase database to add new features.
-- Safe to run on a database that already has the schema.sql tables.

-- ============================================================
-- 1. Pieces table (repertoire tracker)
-- ============================================================

create table if not exists pieces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  title text not null,
  composer text,
  status text not null default 'new'
    check (status in ('new', 'working', 'polishing', 'done')),
  started_at timestamptz not null default now(),
  last_practiced_at timestamptz,
  notes text
);

alter table pieces enable row level security;

create policy "own pieces" on pieces
  for all using (auth.uid() = user_id);

-- ============================================================
-- 2. Additional scale / arpeggio variations
-- ============================================================

insert into scale_variations (name, description, difficulty, sort_order) values
  ('Arpeggio RH only', 'Right hand: play chord tones as an arpeggio ascending one octave', 1, 11),
  ('Arpeggio LH only', 'Left hand: play chord tones as an arpeggio ascending one octave', 1, 12),
  ('Arpeggio both hands', 'Both hands together: ascending arpeggio across two octaves', 2, 13),
  ('Broken chord pattern', 'Play 1-3-5-3 repeating pattern ascending the keyboard', 2, 14),
  ('Arpeggio contrary motion', 'RH ascends, LH descends the arpeggio simultaneously from root', 3, 15);
