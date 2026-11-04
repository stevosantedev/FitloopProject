# Local development

FitLoop is easiest to run locally with Node.js 20+, npm 10+, Python 3.11+ and PostgreSQL 15+.

## First-time setup

1. Copy `.env.example` to `.env`.
2. Replace the example JWT secret with a random value of at least 32 characters.
3. Create a local PostgreSQL database and put its connection string in `DATABASE_URL`.
4. Install JavaScript packages with `npm install`.
5. Generate the Prisma client with `npm run db:generate`.
6. Apply the checked-in migration history with `npm run db:migrate:deploy`.
7. Add the starter exercise definitions with `npm run db:seed`.
8. Start the React frontend and Express API with `npm run dev`.

The browser app is available at port 5173 and the API at port 4000.

## Start the coaching service

Open another terminal, create and activate a Python virtual environment, then install the coach dependencies:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r coach/requirements.txt
uvicorn main:app --app-dir coach --reload --port 8000
```

On Windows, activate the environment with `.venv\\Scripts\\activate`. The coach needs to be running for the dashboard's coaching check-in action to work. Daily logging, workout tracking and the friends feed do not call the coach service.

## Checks

- `npm run build` checks backend JavaScript syntax and builds the frontend.
- `npm test` runs the backend Node.js test command.
- `pytest coach/test_coach.py` runs the Python rule tests.
- `npm run db:validate` checks that Prisma can read the database model.
- `npm run db:migrate:dev` creates and applies a development migration after a schema change.
- `npm run db:migrate:deploy` applies checked-in migrations to a deployment database.
- `npm run db:migrate:status` reports which migrations have been applied.
- `GET /health` checks the API.
- `GET http://localhost:8000/health` checks the coach.

The GitHub Actions workflow runs schema validation, client generation, backend checks, the frontend build and Python tests on pushes and pull requests.


#
## Authentication and deployment security

The API issues short-lived bearer tokens (two hours). Tokens are signed with HS256 and checked against a fixed issuer and audience; the verifier explicitly allows only HS256. Authentication failures return a generic response, and failed authentication requests are limited to 10 per IP in a 15-minute window. Helmet security headers, a configured frontend origin and a 32 KB JSON body limit are applied before API routes.

The current browser client stores its bearer token in local storage. This is acceptable only as an MVP trade-off: any successful script injection in the app's origin could read it. Before a public production deployment, move session handling to Secure, HttpOnly, SameSite cookies (with CSRF protection), review the hosting proxy and HTTPS configuration, and add monitoring and abuse controls. Do not treat the current rate limit as a substitute for an edge firewall or a production security review.

## Browser tests

The Playwright suite starts the Vite app and mocks API responses so it can test the real browser interface without a local database. Install the Chromium browser once with `npx playwright install chromium`, then run `npm run test:e2e`. The suite covers sign-in, guided set progression, rest-timer controls and workout-save validation. The CI workflow installs Chromium and runs the same suite on every branch update.

## A few useful reminders

Keep `.env` out of Git. Do not use real health or mood data in fixtures. When changing the Prisma schema, create a reviewed migration with `npm run db:migrate:dev`, inspect the generated SQL, and commit both the schema and migration. Use `npm run db:migrate:deploy` for deployment environments; it applies committed migrations without generating new ones. `npm run db:push` remains available for disposable local databases only. The initial migration is a baseline for a new empty database. If a database already contains the schema created with `db:push`, back it up and follow Prisma's baseline/adoption procedure before running deploy; do not apply the initial create-table script to an already-populated database.


## Offline workout recording

The installable browser app caches its application shell and static assets, but the service worker deliberately does not cache API traffic. After a user has signed in and the exercise catalogue has loaded once, FitLoop keeps that catalogue scoped to the account in browser storage so a previously authenticated user can build a workout without a network connection.

Completed offline sessions are stored in IndexedDB with the owning account ID and a client-generated UUID. The bearer token is not copied into the queue. When connectivity returns, the app sends queued sessions using the currently signed-in account's token. The API stores the UUID as a unique nullable `WorkoutSession.clientRequestId`; retries return the original session rather than creating duplicate sets or feed posts. Queue entries are removed only after the API confirms success.

Offline recording requires a prior successful sign-in and one successful exercise-catalogue load. If browser storage is unavailable, the app cannot promise offline persistence. Pending sessions remain on that browser until they sync; signing out does not delete them, and they are only read for the matching account. Clearing browser site data will remove unsynced sessions. This is a single-device queue, not cross-device sync or a backup.
