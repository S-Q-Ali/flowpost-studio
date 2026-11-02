-- 20260508 replaced the own-profile policy with USING (true), so every signed-in
-- role — and anon, since the policy has no TO clause — could read every user row:
-- email, avatar URL and the is_admin flag. Nothing needs it: the web app always
-- selects its own row by id, and the edge functions run as the service role,
-- which bypasses RLS.
DROP POLICY IF EXISTS "users_select" ON public.users;

CREATE POLICY "users_select" ON public.users
  FOR SELECT USING (auth.uid() = id);
