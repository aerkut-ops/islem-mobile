select cron.schedule(
  'process-push-notifications',
  '* * * * *',
  $job$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'islem_project_url'
      ) || '/functions/v1/push-worker',
      headers := jsonb_build_object(
        'Content-Type',
        'application/json',
        'x-push-secret',
        (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'islem_push_worker_secret'
        )
      ),
      body := jsonb_build_object('scheduled_at', now()),
      timeout_milliseconds := 15000
    );
  $job$
);
