-- Warm directory + topology snapshots shared across Vercel instances.
-- Apply on the TransitBuddy Supabase project. Code still works without this bucket (tmpdir only).

insert into storage.buckets (id, name, public, file_size_limit)
values ('transitbuddy-cache', 'transitbuddy-cache', false, 52428800)
on conflict (id) do nothing;
