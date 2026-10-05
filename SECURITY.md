# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report them privately through GitHub: **Security → Report a vulnerability** on this repository
(GitHub private vulnerability reporting). Include what you found, how to reproduce it, and the
impact you expect. You will get an answer as soon as possible, and a fix will be released before
details are made public.

## Scope

In scope: the API (`src/`), the web app (`web/`), and the default deployment configuration
(`render.yaml`, `docker-compose.yml`, `.env*.example`).

Out of scope: third-party services (Supabase, Render, Vercel, Upstash, AI providers) and
self-hosted instances running with configuration that differs from the documented defaults.

## Hardening checklist for self-hosters

- Keep `ALLOW_PUBLIC_REGISTRATION=false` (the production default) or use `REGISTRATION_INVITE_CODE`.
- Set `COOKIE_SECURE=true` in production. Use `COOKIE_SAME_SITE=lax` when the web app reaches the
  API through its own `/backend` proxy; `none` is only needed when the browser calls the API cross-site.
- Set `GOOGLE_CLIENT_ID` before enabling Google sign-in; the API rejects Google tokens without it.
- Never commit `.env` files. Rotate any key that has been shared or logged.
