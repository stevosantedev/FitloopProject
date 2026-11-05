# Project status and completion plan

Last reviewed: 5 November 2026

This document separates implemented functionality from the work still required to call FitLoop a complete university-project submission or a production service. A feature is not considered complete merely because its UI exists: its API behaviour, validation, failure states and tests must also be checked.

## Current position

FitLoop is a connected, working MVP foundation. The main product path is present across the React application, Express API, PostgreSQL/Prisma data model and Python coaching service. The strongest completed area is the training workflow: exercise discovery, routine management, guided set recording, workout history, progression, personal records and muscle training summaries.

The application has an app-oriented responsive shell and installable web-app foundation, with explicit loading, error and retry feedback across the overview, workouts and community areas. It supports offline workout queueing and retry-safe synchronisation, including account isolation, reload recovery, sign-out/sign-in recovery, expired-session retry and invalid-payload handling. Account deletion is covered by both unit tests and a PostgreSQL-backed cascade test. The latest branch-head CI run (5 November 2026) passed both application and coaching-service jobs, including the browser suite.

## Implemented product areas

- **Accounts:** registration, sign-in, authenticated API routes, account-scoped data and account deletion.
- **Daily habits:** daily check-ins, logs, trends and analytics.
- **Training:** exercise catalogue, search and filters, exercise guides, routines, guided sessions, set metadata, workout history and progression.
- **Exercise reference:** 101 seeded movements, 31 canonical muscles, individually authored guide content and original front/back muscle navigation artwork. Seed validation requires at least three non-empty technique steps, a substantive description, non-empty unique aliases, at least three non-empty unique coaching cues and non-empty unique equipment alternatives for every movement; it also checks muscle-link integrity and canonical muscle coverage. These checks establish data completeness and consistency, not exercise-science accuracy.
- **Training insights:** personal records, muscle-volume estimates and recent top-load trends. These are based on logged data and clearly avoid presenting heuristic estimates as medical or physiological measurements.
- **Social:** friend requests, accepted connections, friends-only feed, reactions and comments.
- **Coaching:** user preferences, coaching history and a separate Python service with rule tests.
- **App experience:** responsive desktop sidebar, mobile tab navigation, installable manifest, app icon, service-worker shell cache, safe-area handling, keyboard focus and reduced-motion support.
- **Offline training:** account-scoped exercise catalogue cache, IndexedDB workout queue, reconnection sync, unique client request IDs and server-side retry idempotency.
- **Engineering foundation:** Prisma baseline and follow-up migration, backend tests, Playwright browser suite, CI workflow, architecture/development/privacy documentation and implementation standards.

## Remaining work before the university project can be called complete

### 1. Stabilise and verify the current implementation
- [x] Latest branch-head CI passes both application and coaching-service jobs. The application job validates the Prisma schema and migrations, seeds the catalogue, runs backend tests, builds the frontend and completes the Playwright suite.
- [x] Full browser suite passes on the current feature branch, including offline/reconnection flows and explicit loading/retry behaviour for the exercise library.
- [x] Browser coverage verifies account-scoped queueing and cleanup, persistence across reload and sign-out/sign-in, retry after an expired session, removal of permanently invalid queued payloads, a clear error when IndexedDB is unavailable, and loading/error/retry states for workout data.
- [x] Account deletion is tested at unit level and against PostgreSQL. The integration test verifies removal of daily logs, routines, sessions/sets, planned sessions, coaching records, preferences, social posts, friendships, reactions, comments and private custom exercises, while preserving shared exercises and other users.
- [ ] Complete a human screen-by-screen review of empty, loading, error, validation and success states across the dashboard, workout and community areas. Automated loading/error/retry coverage has been added, but does not replace this full review. Follow `docs/manual-qa-checklist.md` and record evidence.
- [x] Automated responsive checks cover desktop, tablet portrait and mobile navigation, including mobile touch-target sizing. Keyboard-only sign-in navigation and visible focus styling are also covered.
- [ ] Complete a physical-device and screen-reader spot check on the target browsers/devices. Follow `docs/manual-qa-checklist.md`; these require a human using the actual devices and assistive technology. Automated viewport and keyboard tests are not a substitute.

### 2. Finish the exercise library experience
- [ ] Review all 101 exercise guides for factual accuracy, consistent terminology, useful instructions and appropriate regressions. Automated seed checks now enforce minimum content completeness and muscle-link coverage, but do not establish biomechanical accuracy.
- [ ] Verify primary/secondary muscle assignments and movement categories against a documented reference.
- [ ] Source and match suitable exercise stills or demonstrations individually. Record the exact source, creator, licence, attribution and modification history for every asset before use.
- [ ] Do not ship media with unclear rights. If appropriate media cannot be cleared, retain the text-first guide rather than using unverified assets.
- [ ] Check anatomy labels and diagram coverage with a credible anatomy reference; keep the illustration clearly labelled as an orientation aid, not clinical anatomy.

### 3. Complete the product experience
- [ ] Conduct a structured usability evaluation with representative users after ethics approval where required.
- [ ] Fix issues found in onboarding, workout creation, guided workout use, exercise search, history and social flows.
- [ ] Decide and implement the intended notification scope (for example, workout reminders or friend activity), including user controls and permission-denied states. Notifications are not currently a delivered feature.
- [ ] Review accessibility against WCAG 2.2 AA for contrast, focus, labels, keyboard use, touch targets, motion and screen-reader announcements.
- [ ] Add clear account, privacy, data export and deletion explanations appropriate to the final project scope.

### 4. Production security and operations
- [ ] Replace local-storage bearer-token handling with Secure, HttpOnly, SameSite cookie sessions and implement CSRF protection. Review CORS, HTTPS and proxy configuration together.
- [ ] Add password reset and email verification if the intended deployment requires real public accounts; configure a trusted email provider and abuse controls.
- [ ] Review rate limits across login, registration, social actions and other write endpoints; add appropriate monitoring and audit events without logging secrets or sensitive content.
- [ ] Add production environment configuration, secrets management, database backup/restore procedure, migration deployment checks, health monitoring and error reporting.
- [ ] Deploy the frontend, API, database and coaching service to the chosen host; configure domains, TLS, CORS, service URLs and a repeatable release process.
- [ ] Run dependency and security checks, review privacy disclosures and complete a threat-model pass before exposing the service publicly.

### 5. University submission and evidence
- [ ] Confirm the final assessment brief and map every required objective to a FitLoop feature, test or evaluation result.
- [ ] Complete the report: problem statement, research/literature, requirements, design/architecture, implementation, testing, evaluation, limitations, ethics/privacy and future work.
- [ ] Include architecture and data-model diagrams, key interface screenshots and a clear explanation of the coaching logic and training calculations.
- [ ] Capture test evidence: automated test results, browser/device matrix, usability findings and resolved defects.
- [ ] Prepare a reproducible setup guide, demo account/seed data, demo script and final presentation.
- [ ] Obtain required ethics approval before recruiting participants or collecting identifiable/real participant data. Use synthetic data for development and demonstrations until approval and retention/deletion arrangements are confirmed.

## Suggested completion gates

| Gate | Exit condition |
|---|---|
| Feature-complete MVP | All agreed user journeys work end-to-end; no critical/high-priority defects remain; tests cover core success and failure paths. |
| Evaluated university project | Assessment objectives mapped; usability/accessibility evaluation completed; report and evidence are reproducible. |
| Deployment-ready service | Cookie/CSRF security, operational monitoring, backups, deployment configuration and security review completed. |
| Public launch | Legal/privacy/ethics obligations, support process, incident response and production capacity reviewed and approved. |

## Scope decisions still needed

The project should not grow indefinitely by adding features without reference to the assessment brief. In particular, notifications, password reset/email verification, data export and public deployment depend on the intended final scope. The priority should be to stabilise and evaluate the existing training-centred product before expanding it.

## Current release status

The feature branch and pull request remain in draft and unmerged. The project is not yet a finished production service. The latest branch-head CI run (5 November 2026) passed both jobs, including the expanded browser suite. The immediate next step is to complete the human QA checklist, then continue the exercise-library quality/media review and usability evaluation.
