-- Jalankan sekali di Supabase: menu "SQL Editor" -> New query -> tempel -> Run.
-- Membuat tabel penyimpanan data dashboard + aturan keamanan
-- (hanya user yang login yang bisa membaca/menulis).

create table if not exists app_state (
  id integer primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

alter table app_state enable row level security;

create policy "baca oleh user login" on app_state
  for select to authenticated using (true);

create policy "tulis oleh user login" on app_state
  for insert to authenticated with check (true);

create policy "ubah oleh user login" on app_state
  for update to authenticated using (true);
