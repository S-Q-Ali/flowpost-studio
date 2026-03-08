-- Allow 'processing' status for posts (prevents double execution in process-scheduled-posts)
ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_status_check;
ALTER TABLE public.posts ADD CONSTRAINT posts_status_check
  CHECK (status IN ('scheduled', 'processing', 'published', 'failed'));
