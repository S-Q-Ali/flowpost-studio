ALTER TABLE public.workflows DROP CONSTRAINT IF EXISTS workflows_media_type_check;
ALTER TABLE public.workflows ADD CONSTRAINT workflows_media_type_check 
  CHECK (media_type IN ('video', 'image', 'carousel'));

CREATE TABLE IF NOT EXISTS public.carousel_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0 AND sort_order < 10),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(post_id, sort_order),
  UNIQUE(post_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_carousel_items_post_id ON public.carousel_items(post_id);

ALTER TABLE public.carousel_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own carousel items"
  ON public.carousel_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.posts
      WHERE posts.id = carousel_items.post_id
      AND posts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own carousel items"
  ON public.carousel_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.posts
      WHERE posts.id = carousel_items.post_id
      AND posts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own carousel items"
  ON public.carousel_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.posts
      WHERE posts.id = carousel_items.post_id
      AND posts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own carousel items"
  ON public.carousel_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.posts
      WHERE posts.id = carousel_items.post_id
      AND posts.user_id = auth.uid()
    )
  );
