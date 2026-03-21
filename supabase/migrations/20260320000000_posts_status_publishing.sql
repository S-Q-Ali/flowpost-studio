-- Allow 'publishing' status for atomic claim before Instagram media_publish (dedupe)
ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_status_check;
ALTER TABLE public.posts ADD CONSTRAINT posts_status_check
  CHECK (status IN ('scheduled', 'processing', 'publishing', 'published', 'failed'));
