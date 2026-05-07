-- Cron job for cleanup-r2 to delete videos 24 hours after publishing
-- Schedule: Run every hour
-- Note: Requires pg_cron extension to be enabled in Supabase Dashboard

SELECT cron.schedule(
  'cleanup-r2-videos',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.SB_URL', true) || '/functions/v1/cleanup-r2',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.SB_SERVICE_ROLE_KEY', true),
      'apikey', current_setting('app.settings.SB_SERVICE_ROLE_KEY', true)
    ),
    body := '{}'::jsonb
  );
  $$
);