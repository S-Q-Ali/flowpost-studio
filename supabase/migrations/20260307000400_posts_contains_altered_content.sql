ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS contains_altered_content BOOLEAN DEFAULT false;
