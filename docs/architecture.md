# FitLoop architecture

## The main pieces

FitLoop has four application parts:

- **React frontend:** the responsive app shell, training screens, Community feed and Coach conversation.
- **Express API:** sign-in, account ownership checks, validation and the routes used by the frontend.
- **PostgreSQL and Prisma:** account data, workouts, exercise definitions, social relationships, notifications and Coach history.
- **Python Coach service:** transparent training and habit rules, with an optional external model path for accounts that explicitly enable it.

The browser never talks directly to PostgreSQL or the Python service. Private requests go through the API, which decides what data can be read and what context may leave the application.

## A typical request

1. A person signs in and receives a short-lived token.
2. The browser sends the token with requests for private information.
3. The API verifies the token and uses its subject to scope database queries.
4. Prisma reads or updates the matching account records.
5. The API returns only the fields needed by the current screen.

The API does not trust a user ID supplied by the browser to decide whose records to read.

## Coach request flow

Coach conversations are stored against the signed-in account. Before a message is processed, the API checks the account's hourly message limit using a PostgreSQL-backed store. Separate API instances therefore share the same counter instead of keeping independent in-memory limits.

The API then selects up to five recent completed workout sessions. It sends the Python service only the date, routine name, exercise names, repetitions and logged loads. Account identifiers, private session notes and daily wellbeing logs are excluded.

The Python service returns a guided response by default. An optional OpenAI-compatible chat-completions endpoint can be configured by the operator, but it is used only when the account has explicitly enabled AI replies and a server-side key is present. The provider URL and model are deployment settings; credentials never reach the browser. Provider errors fall back to the guided response.

Urgent symptoms, injury language, disordered-eating requests, unsafe weight-loss methods and drug or supplement dosing stay on the guided safety path and bypass external model processing. These deterministic checks are safeguards, not a substitute for independent safety evaluation or clinical advice.

## Feature boundaries

- Daily check-ins are stored once per user per calendar date.
- Workout routines are reusable templates; sessions represent what was completed and can contain several exercises.
- Exercise definitions link to canonical muscle records, with primary and secondary roles. Training summaries weight those roles for a transparent volume estimate.
- A completed workout can be shared to the friends-only feed. The feed API checks accepted relationships and account blocks on every page.
- Community reports are private moderation records. Only deployment-allowlisted moderators can review them.
- In-app activity notifications are private to their recipient. Push and email delivery are not implemented.
- Coach preferences change the wording and focus, not the underlying safety boundaries.
- Coach decisions are stored against the original message so the project can review whether suggestions were accepted or declined.

## Current limits

The workout logger supports multi-exercise sessions with individually editable set rows. Each row stores its own repetitions, load and completion state; set type, rest duration and RIR/RPE are configured per exercise. Set numbers are unique within each exercise and the API rejects duplicate rows. The guided workout snapshots pending set rows in exercise order, records each completed set and runs the exercise-specific rest period before advancing. Pause, skip and stop controls are available.

The first-party front/back anatomy illustration draws individual muscle shapes as a visual reference; it is not a clinical diagram. Muscle-volume and time-since-training summaries are heuristics, not physiological assessments. The exercise guides and muscle mappings still need expert review, and exercise media must not be added until each asset's rights are checked.

Offline workout sync uses an account-scoped IndexedDB queue and server-side request idempotency. The current authentication flow stores bearer tokens in browser storage; a public production deployment should move to Secure, HttpOnly, SameSite cookies with CSRF protection and a reviewed HTTPS/proxy setup.

The optional AI provider has not been verified with a live operator key. Provider data-processing and retention settings, shared rate limits for other sensitive endpoints, physical-device and screen-reader QA, production monitoring, backups and deployment configuration remain release work.
