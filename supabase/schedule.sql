-- Run manually AFTER deployment and configuring Vault secrets. Never commit values.
-- select vault.create_secret('https://mwwrnhhbippprmidgaus.supabase.co','health_project_url');
-- select vault.create_secret('<same value as Edge CRON_SECRET>','health_cron_secret');
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.schedule('health-oura-hourly','15 * * * *',$$
 select net.http_post(
   url := (select decrypted_secret from vault.decrypted_secrets where name='health_project_url') || '/functions/v1/oura-sync',
   headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='health_cron_secret')),
   body := '{}'::jsonb
 );
$$);
