ALTER TABLE public.posts ADD COLUMN post_type TEXT NOT NULL DEFAULT 'feed' CHECK (post_type IN ('feed', 'story'));
