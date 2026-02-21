-- Scale variations (static reference data)
create table scale_variations (
  id serial primary key,
  name text not null,
  description text not null,
  difficulty int not null check (difficulty between 1 and 3), -- 1=easy, 2=medium, 3=hard
  sort_order int not null
);

-- Chord voicings / progression types (static reference data)
create table chord_voicings (
  id serial primary key,
  name text not null,
  description text not null,
  sort_order int not null
);

-- Practice sessions: one row per key practiced per day
create table key_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  key_name text not null,       -- e.g. 'C', 'G', 'F#'
  mode text not null,           -- 'major' | 'minor'
  practiced_at timestamptz not null default now(),
  bpm int,
  feel int check (feel between 1 and 3), -- 1=struggle, 2=ok, 3=solid
  notes text
);

-- Which variations were completed in a session
create table session_variations (
  id serial primary key,
  session_id uuid references key_sessions(id) on delete cascade,
  variation_id int references scale_variations(id),
  completed boolean not null default false
);

-- RLS: users can only see their own sessions
alter table key_sessions enable row level security;
alter table session_variations enable row level security;

create policy "own sessions" on key_sessions
  for all using (auth.uid() = user_id);

create policy "own session variations" on session_variations
  for all using (
    session_id in (
      select id from key_sessions where user_id = auth.uid()
    )
  );

-- Reference tables are public read
alter table scale_variations enable row level security;
alter table chord_voicings enable row level security;

create policy "public read scale_variations" on scale_variations
  for select using (true);

create policy "public read chord_voicings" on chord_voicings
  for select using (true);

-- Seed scale variations
insert into scale_variations (name, description, difficulty, sort_order) values
  ('Unison up', 'Both hands ascending from root together', 1, 1),
  ('Unison down', 'Both hands descending from root together', 1, 2),
  ('Up and down', 'Both hands: ascend then descend, root to octave', 1, 3),
  ('From iii up', 'Start both hands on the third degree, ascend to octave', 2, 4),
  ('Contrary motion', 'RH ascends, LH descends simultaneously from root', 2, 5),
  ('Hands separate RH', 'Right hand only, full scale up and down', 1, 6),
  ('Hands separate LH', 'Left hand only, full scale up and down', 1, 7),
  ('Dotted rhythm (long-short)', 'Ascending with dotted-eighth + sixteenth rhythm', 2, 8),
  ('Dotted rhythm (short-long)', 'Ascending with sixteenth + dotted-eighth rhythm', 2, 9),
  ('Two octaves', 'Both hands ascending two octaves from root', 2, 10);

-- Seed chord voicings
insert into chord_voicings (name, description, sort_order) values
  ('Root position I-IV-V7', 'I, IV, V7 all in root position', 1),
  ('Close position', 'Tight voicing, minimal hand movement between chords', 2),
  ('I first inversion', 'I chord in first inversion, IV and V7 root position', 3),
  ('Broken chord arpeggio', 'Play each chord as ascending then descending arpeggio', 4);
