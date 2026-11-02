-- A publish attempt stamps claimed_at so two callers that read the same row
-- cannot both send it to the platform.
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

-- Older live duplicates are failed, not deleted, so the unique index below can
-- be created on databases that already hold them.
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY user_id, video_id, platform, coalesce(account_id, ''), post_type
    ORDER BY created_at
  ) AS rn
  FROM public.posts
  WHERE status IN ('scheduled', 'processing', 'publishing')
)
UPDATE public.posts
SET status = 'failed'
FROM ranked
WHERE posts.id = ranked.id AND ranked.rn > 1;

-- One live row per target. A null account_id would count as distinct in a
-- plain unique index, so it is folded to an empty string.
CREATE UNIQUE INDEX IF NOT EXISTS posts_one_live_per_target
  ON public.posts (user_id, video_id, platform, coalesce(account_id, ''), post_type)
  WHERE status IN ('scheduled', 'processing', 'publishing');
