# Attendance

An admin-only school attendance application built with TanStack Start, Cloudflare Workers/D1, Firebase Google Sign-In, Tailwind CSS, and daisyUI.

## Local setup

1. Copy `.env.example` to `.env` and fill in the Firebase web configuration from the Firebase console.
2. Enable **Google** under Firebase Authentication → Sign-in method.
3. Run `pnpm db:migrate:local` once, then `pnpm dev`.
4. Sign in once with the account that should become the first admin. The screen will show that it awaits approval.
5. Download a service-account key from Firebase console → Project settings → Service accounts → **Generate new private key**, save it locally (e.g. `firebase-service-account.json`, matching the shape of [`firebase-service-account.example.json`](firebase-service-account.example.json) — never commit the real file), set `FIREBASE_SERVICE_ACCOUNT_PATH` in `.env` to its path, and run `pnpm admin:grant you@school.edu`. Sign out and sign in again.

Firebase custom claims are the access boundary: every private Worker request verifies the Firebase ID token and requires `admin: true`.

## Cloudflare deployment

1. Run `pnpm exec wrangler login`.
2. Create the D1 database with `pnpm exec wrangler d1 create ss-attendance`.
3. Copy the emitted D1 binding identifiers into `wrangler.jsonc`, replacing the placeholder `database_id`.
4. Add `FIREBASE_PROJECT_ID` as a Worker secret: `pnpm exec wrangler secret put FIREBASE_PROJECT_ID`.
5. Apply the production schema with `pnpm db:migrate:remote` and publish with `pnpm deploy`.

The `VITE_FIREBASE_*` values are Firebase’s public web configuration and must be present during the client build. The Firebase project ID used by Worker token verification stays server-side.

## Commands

- `pnpm dev` — local Worker development
- `pnpm test` — attendance-rule tests
- `pnpm db:migrate:local` — initialize the local D1 database
- `pnpm db:migrate:remote` — apply migrations to the configured Cloudflare D1 database
- `pnpm admin:grant <email>` / `pnpm admin:revoke <email>` — manage Firebase admin claims
- `pnpm deploy` — build and deploy the Worker
