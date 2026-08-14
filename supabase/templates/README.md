# Supabase auth email templates

These templates use a mobile deep link with `token_hash` so the app can verify
the link without relying on a PKCE verifier stored by the browser.

Deployment order:

1. Release an app build that supports `token_hash` callbacks.
2. Update the Supabase **Confirm signup** template with `confirmation.html`.
3. Update the Supabase **Magic Link** template with `magic-link.html`.

Do not deploy these templates before the compatible app build is available.
