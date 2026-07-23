CREATE TABLE public.page_eligibility (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id              TEXT NOT NULL,
  page_id              TEXT NOT NULL,
  page_name            TEXT,
  eligibility_bucket   TEXT,
  monetization_tools   JSONB,
  criteria_progress    JSONB,
  checked_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, page_id)
);

ALTER TABLE public.page_eligibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "page_eligibility_select"
  ON public.page_eligibility FOR SELECT
  USING (user_id = auth.uid()::text OR user_id = '00000000-0000-0000-0000-000000000000');

CREATE POLICY "page_eligibility_insert"
  ON public.page_eligibility FOR INSERT
  WITH CHECK (user_id = auth.uid()::text OR user_id = '00000000-0000-0000-0000-000000000000');

CREATE POLICY "page_eligibility_update"
  ON public.page_eligibility FOR UPDATE
  USING (user_id = auth.uid()::text OR user_id = '00000000-0000-0000-0000-000000000000');

CREATE POLICY "page_eligibility_delete"
  ON public.page_eligibility FOR DELETE
  USING (user_id = auth.uid()::text OR user_id = '00000000-0000-0000-0000-000000000000');
