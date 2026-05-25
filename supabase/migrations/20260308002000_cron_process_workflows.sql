-- Cron job for process-workflow
-- 1. In Supabase Dashboard → Database → Extensions, enable: pg_cron, pg_net
-- 2. Run ONE of the following in SQL Editor (uncomment and replace placeholders as needed).

-- Option A: Literal URL and key (replace YOUR_PROJECT_REF and YOUR_SERVICE_ROLE_KEY)
/*
select cron.schedule(
  'process-workflows',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/process-workflow',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY',
      'apikey', 'YOUR_SERVICE_ROLE_KEY'
    ),
    body := '{}'::jsonb
  );
  $$
);
*/

-- Option B: Vault secrets (if you use Supabase Vault with SB_URL and SB_SERVICE_ROLE_KEY)
-- Vault table may be vault.decrypted_secrets with column decrypted_secret, or vault.secrets with value
/*
select cron.schedule(
  'process-workflows',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'SB_URL') || '/functions/v1/process-workflow',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'SB_SERVICE_ROLE_KEY'),
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'SB_SERVICE_ROLE_KEY')
    ),
    body := '{}'::jsonb
  );
  $$
);
*/

