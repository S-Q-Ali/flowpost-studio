-- This index exists only in production. Nothing in the repo creates it, and it
-- covers the final statuses: the second post of one video to one account is
-- refused with 23505 exactly when a publisher tries to write `published`, so
-- the platform call succeeded and the row stayed `processing` or `publishing`.
-- posts_one_live_per_target already stops live duplicates per target, which is
-- the rule this index was meant to enforce.
DROP INDEX IF EXISTS public.posts_unique_per_account;
