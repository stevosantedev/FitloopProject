# FitLoop

FitLoop is a fitness and everyday wellbeing app for people whose routines change from week to week. It brings workout tracking, daily check-ins, a friends community and a guided coaching service into one account.

The project is aimed at people who want to look after their health and training while balancing study, work, family and other commitments. It focuses on practical records and small changes that fit around real schedules.

## What is implemented

### Workouts and exercise reference

- A seeded exercise catalogue with 101 movements and 31 canonical muscles.
- Search across exercise names, aliases, descriptions, instructions, coaching cues and equipment.
- Filters for muscle group, equipment, movement pattern and difficulty.
- Exercise guides with movement descriptions, technique steps, cues, equipment alternatives and primary/secondary muscle links.
- An interactive front/back muscle map with selectable regions and training-volume summaries.
- Reusable workout routines, multi-exercise sessions and editable set records.
- Per-set categories, rest periods, RIR/RPE values and a guided set-by-set workout flow with pause, skip and stop controls.
- Workout history, recent movement progress, personal records and weighted muscle-volume summaries.
- Editable two-to-six-day training programmes built from the exercise catalogue. Each day can be reviewed and adjusted before saving, then loaded into the workout builder.

The muscle map is a training reference, not a clinical anatomy diagram. Set-volume and progression summaries describe logged workouts and should not be read as medical or physiological assessments.

### Daily check-ins and overview

- Daily records for sleep, steps, mood and focused work or study time.
- A weekly overview of workouts, completed sets and check-ins, with a seven-day strip that marks only activity the user has logged.
- Seven-day check-in history and simple charts for the recorded measures.
- Loading, empty, error and retry states for the main data views.

### Social and community

- Account profiles with display names, short bios and visibility controls, plus a dedicated signed-in profile view backed by an owner-scoped, cursor-paginated history of the member's own shared posts and workout summaries.
- Social workspace navigation with Feed, Explore, Pings and Profile destinations. Explore combines bounded people discovery with a paginated public post feed containing text updates and workout summaries.
- Pings request-based one-to-one messaging: introductory message requests, recipient-only accept/decline, private-profile friend boundaries, participant-scoped conversation history, rate-limited replies, block checks, read receipts, unread counts, and in-thread message/member reporting and blocking.
- Friend discovery, requests, accepted connections and relationship management.
- A friends-oriented activity feed with workout summaries and text updates.
- Reactions, comments, pagination and author controls for editing or deleting eligible posts and comments.
- Blocking and reporting controls, with server-side audience and relationship checks.
- A private in-app activity inbox for friend requests, accepted requests, reactions and comments.

The current feed supports text updates and workout activity. Pings now has a working request-and-reply flow with unread counts and member-level report/block controls, but inbox notifications, delivery preferences and retention rules still need implementation and review. Image uploads, private media storage and push/email notifications are not implemented.

### Coach

- Private, persistent conversations with a history list and message controls.
- A deterministic, rule-guided coaching service with explanations for its suggestions.
- Training context based on a limited summary of recent completed workouts.
- Guided responses for common training questions, with conservative handling of pain, injury and urgent symptom wording.
- Recent progression comparisons based on completed workout history.
- Catalogue-based routine and weekly programme drafts that users can review and edit before saving.
- Coaching tone and focus preferences, plus feedback on whether a suggestion was useful.

The rule-guided service is the default. An optional hosted generative reply path is present but disabled by default and requires explicit opt-in. If enabled, the user's message, coaching preferences and a bounded summary of recent completed workouts are sent to the configured provider. Private session notes, daily wellbeing logs and account identifiers are excluded. This optional path differs from the original project proposal, which specified local/backend rule-based coaching and no hosted language model processing of personal data. Keep it disabled unless the project scope, privacy assessment and consent wording are formally approved.

### App shell and offline use

- Installable Progressive Web App (PWA) with a web app manifest and standalone display mode.
- Two top-level workspaces, Social and You, with context-sensitive navigation. Social contains Feed, Explore, Pings and Profile; You contains Home, Workout, Stats, Plan and Library.
- A compact weekly activity strip on Home and in-page shortcuts for the main Training tasks.
- Account preferences and permanent account deletion are kept in a separate settings sheet rather than the daily Home feed.
- Safe-area support, visible keyboard focus and reduced-motion handling.
- A service worker that caches the application shell and static assets. API requests and cross-origin traffic are excluded.
- An account-scoped IndexedDB queue for completed workouts recorded offline.
- Retry-safe workout synchronisation using a client request identifier to avoid duplicate sessions after interrupted requests.
- Account-specific cleanup of queued workouts and cached exercise catalogue data when an account is deleted.

FitLoop is currently a responsive PWA. It does not include native iOS or Android applications.

## Technology

- Frontend: React, TypeScript and Vite.
- API: Node.js and Express.
- Data: PostgreSQL and Prisma.
- Coaching service: Python and FastAPI.
- Browser testing: Playwright.
- Backend tests: Node.js test runner and API integration tests.
- Coaching tests: pytest.

## Project structure

- `frontend/`: React application, styles, PWA assets and browser tests.
- `backend/`: Express API, Prisma schema, migrations, seeds and backend tests.
- `coach/`: Python service and rule-based coaching tests.
- `docs/`: architecture, setup, privacy, implementation standards, QA and completion planning.

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- Python 3.11 or newer
- PostgreSQL 15 or newer

## Local setup

1. Copy `.env.example` to `.env` and replace the example JWT secret with a random value of at least 32 characters.
2. Create a local PostgreSQL database and update `DATABASE_URL`.
3. Install JavaScript dependencies with `npm install`.
4. Generate the Prisma client with `npm run db:generate`.
5. Apply the checked-in database migrations with `npm run db:migrate:deploy`.
6. Add the starter exercises with `npm run db:seed`.
7. Start the frontend and API with `npm run dev`.
8. In another terminal, install `coach/requirements.txt` in a Python virtual environment, then run `uvicorn main:app --app-dir coach --reload --port 8000`.

The frontend runs on port 5173, the API on port 4000 and the coaching service on port 8000. The coaching service is used for guided coaching and check-in suggestions. The optional hosted AI reply path also requires explicit user opt-in and server-side provider configuration.

## Useful commands

- `npm run dev`: start the frontend and backend.
- `npm run build`: check backend JavaScript syntax and create the frontend production build.
- `npm test`: run the backend Node.js test command.
- `npm run test:e2e`: run the Playwright browser suite.
- `npm run db:validate`: validate the Prisma schema.
- `npm run db:generate`: generate the Prisma client.
- `npm run db:migrate:dev`: create a reviewed migration after changing the Prisma schema.
- `npm run db:migrate:deploy`: apply checked-in migrations to a database.
- `npm run db:migrate:status`: show migration status.
- `npm run db:push`: update a disposable local database without creating a migration (development only).
- `npm run db:seed`: add the starter exercise library.
- `pytest coach/test_coach.py`: run the Python coaching tests.

## Current status

The project has connected MVP flows for accounts, daily tracking, training, social community and coaching. The app shell now separates Social from You and gives each workspace its own bottom navigation. The current visual pass uses charcoal surfaces, warm orange actions, stronger type hierarchy and restrained panel depth. It is still under development. The current work is focused on the mobile-first interface, screen-by-screen visual review, accessibility and usability checks, exercise content review, privacy decisions and final project evidence.

See the [project status and completion plan](docs/project-status-and-completion.md) for the remaining work and completion gates. The [product expansion roadmap](docs/product-expansion-roadmap.md) records the delivery status and acceptance criteria for training, Coach and Community.

## Development standards

Read [the implementation standards](docs/implementation-standards.md) before changing substantial code. Comments should explain why a block exists, its assumptions, data boundaries and side effects. Add them close to the relevant logic, including in tests, migrations and schema changes. Keep prose direct and natural, following the project's Humanizer writing guidance.

## Privacy and safety

Sleep, mood, activity and workout records are personal information. Keep the database private, use HTTPS outside local development, and never commit real environment files. Do not log tokens, private messages or sensitive user records.

The Coach is a habit and training reflection aid. It does not diagnose conditions or prescribe medical treatment. Do not collect real participant data until the required university ethics approval, retention rules and deletion process are in place. Use synthetic accounts and records for development and demonstrations until those arrangements are confirmed.

The current authentication implementation uses bearer tokens stored by the frontend. Before a public deployment, replace this with Secure, HttpOnly, SameSite cookie sessions and CSRF protection, then review CORS, HTTPS, rate limits, secrets management, monitoring and database backups.

## Known gaps

- Complete the phone-first redesign and inspect real browser screenshots across phone, tablet and desktop sizes.
- Finish Pings with unread counts, message-level reporting, notification preferences, retention rules and a dedicated privacy/security review.
- Finish keyboard, screen-reader, contrast and touch-target checks against WCAG 2.2 AA.
- Run usability sessions with appropriate ethics approval and record the findings.
- Have the exercise instructions and muscle mappings reviewed for accuracy; source and license any exercise media before adding it.
- Decide whether the optional hosted AI path is compatible with the original scope and privacy requirements. Keep it disabled until that decision is made.
- Add secure cookie authentication and production deployment controls.
- Complete the assessment report, architecture and data-model diagrams, test evidence, demo script and presentation.

Do not describe the current branch as production-ready. It is a substantial university-project MVP that still needs evaluation, security work and submission evidence.


The latest interface pass gives the phone layouts a consistent charcoal and orange theme, a persistent workspace switch, and more focused feed, workout and profile surfaces. Responsive browser coverage checks the navigation at 320px, 360px, 390px and 430px. These changes are still under visual review; passing layout tests alone does not mean the redesign is finished.

Explore has a separate, paginated public-post endpoint and supports reactions and comments on posts from public profiles. These interaction routes recheck visibility on the server: accepted friends can still interact with private-profile posts, public posts are available outside the friend list, and blocks override both paths. Public discovery currently displays text updates and workout summaries; photo and video uploads are still planned.
