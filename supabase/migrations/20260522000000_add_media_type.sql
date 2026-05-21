-- Add media_type to workflows table
ALTER TABLE workflows 
ADD COLUMN media_type TEXT NOT NULL DEFAULT 'video' 
CHECK (media_type IN ('video', 'image'));

-- Add media_type to videos table
ALTER TABLE videos 
ADD COLUMN media_type TEXT NOT NULL DEFAULT 'video' 
CHECK (media_type IN ('video', 'image'));
