# Project status and completion plan

Last reviewed: 9 November 2026

This document separates implemented functionality from the work still required to call FitLoop a complete university-project submission or a production service. A feature is not considered complete merely because its UI exists: its API behaviour, validation, failure states and tests must also be checked.

## Current position

FitLoop is a connected, working MVP foundation. The main product path is present across the React application, Express API, PostgreSQL/Prisma data model and Python coaching service. The strongest completed area is the training workflow: exercise discovery, routine management, guided set recording, workout history, progression, personal records and muscle training summaries.

The application has an installable app shell with persistent desktop navigation and thumb-reachable mobile tabs. The first visual refresh introduces a graphite/lime training-first system, platform typography, consistent line icons, active-page semantics, clearer screen-specific copy and flatter dashboard sections. The screen hierarchy now prioritises the active workout builder, the Community activity feed and composer, and the Coach conversation. The visual work is still in progress; automated viewport coverage must be complemented by human review on real devices. It supports offline workout queueing and retry-safe synchronisation, including account isolation, reload recovery, sign-out/sign-in recovery, expired-session retry and invalid-payload handling. Account deletion is covered by unit tests and a PostgreSQL-backed cascade test that now includes bidirectional blocks and private reports. The latest completed branch-head CI run ([9 November 2026, run 42551026831](https://github.com/stevosantedev/FitloopProject/actions/runs/42551026831)) passed both application and coaching-service jobs. It includes 129 backend tests and 52 Playwright browser tests; the application job also validates Prisma migrations/schema, seeds the catalogue, builds the frontend and checks service-worker syntax.

## Implemented product areas

- **Accounts:** registration, sign-in, authenticated API routes, account-scoped data and account deletion.
- **Daily habits:** daily check-ins, logs, trends and analytics.
- **Training:** exercise catalogue, search and filters, exercise guides, routines, guided sessions, set metadata, workout history and progression.
- **Exercise reference:** 101 seeded movements, 31 canonical muscles, individually authored guide content and original front/back muscle navigation artwork. Seed validation requires at least three non-empty technique steps, a substantive description, non-empty unique aliases, at least three non-empty unique coaching cues and non-empty unique equipment alternatives for every movement; it also checks muscle-link integrity and canonical muscle coverage. These checks establish data completeness and consistency, not exercise-science accuracy.
- **Training insights:** personal records, muscle-volume estimates and recent top-load trends. These are based on logged data and clearly avoid presenting heuristic estimates as medical or physiological measurements.
- **Social:** private-by-default profile editing and server-enforced public/private visibility; bounded, rate-limited username/display-name discovery with identity-only results and exclusion of existing/blocked relationships; friend requests and relationship management; friends-only text/workout feed, author-only text-update editing/deletion, selectable/changeable/removable own reactions with immediate optimistic updates and failure rollback, author-only comment editing/deletion, per-post cursor-based comment pagination, movement-level workout summary cards that exclude private session notes, account blocking, mutual visibility enforcement, private post/account reports with server-side validation and rate limiting, and cursor-based feed pagination.
- **Coaching:** private conversation history, user preferences, a separate Python rule-guided service, account-scoped recent-workout context, API tests proving private fields are excluded and an in-product disclosure explaining exactly which training fields are sent and which sensitive fields are excluded. An optional AI-generated reply path uses a server-side OpenAI-compatible Chat Completions endpoint; it is off by default, requires explicit account opt-in and a configured server key, sends only the bounded recent-workout summary, and falls back to guided rules on provider failure. Urgent-symptom, injury, disordered-eating, unsafe weight-loss and drug/supplement-dosing messages bypass the AI path and receive conservative guided responses. The latest reply displays whether it was AI-generated or guided. The provider URL is configurable through AI_COACH_API_URL, and Coach message limits use a PostgreSQL-backed shared store so the hourly account cap applies across API instances. The live provider path has not been tested with an operator-supplied key; retention/data-protection review, broader safety evaluation and cost controls remain outstanding. Progress replies compare highest logged loads for the same movement across separate sessions. A catalogue-based weekly programme builder supports two to six training days and uses goal, equipment and experience to draft a split; users review the proposed days and movements before saving. Saved plans can be edited and individual days can be started in the workout builder. The current split does not prescribe sets, reps or loads, schedule calendar events, or track weekly completion.
- **App experience:** responsive desktop sidebar, mobile bottom tabs, installable manifest, app icon, versioned service-worker shell cache, safe-area handling, keyboard focus and reduced-motion support. The first visual pass adds a graphite/lime palette, platform typography, consistent SVG navigation icons, active-page semantics, more direct product copy and flatter dashboard sections. The screen hierarchy now prioritises the exercise picker in Workouts, friends' activity and posting in Community, and the conversation in Coach. This is an incremental visual refresh, not yet a completed screen-by-screen redesign; human device QA remains outstanding.
- **Offline training:** account-scoped exercise catalogue cache, IndexedDB workout queue, reconnection sync, unique client request IDs and server-side retry idempotency.
- **Engineering foundation:** Prisma baseline and follow-up migration, backend tests, Playwright browser suite, CI workflow, architecture/development/privacy documentation and implementation standards.

## Remaining work before the university project can be called complete

### 1. Stabilise and verify the current implementation
- [x] Latest branch-head CI passes both application and coaching-service jobs (run 42551026831): 129 backend tests and 52 Playwright browser tests passed. The application job validates Prisma migrations/schema, seeds the catalogue, runs backend tests, builds the frontend and completes the browser suite.
- [x] Full browser suite passes on the current feature branch, including offline/reconnection flows, author-only comment editing/deletion, reaction selection/change/removal, immediate optimistic reaction updates with rollback after a simulated server failure, per-post comment pagination, movement-level workout summary cards and explicit loading/retry behaviour for the exercise library.
- [x] Browser coverage verifies account-scoped queueing and cleanup, persistence across reload and sign-out/sign-in, retry after an expired session, removal of permanently invalid queued payloads, a clear error when IndexedDB is unavailable, and loading/error/retry states for workout data.
- [x] Account deletion is tested at unit level and against PostgreSQL. The integration test verifies removal of daily logs, routines, sessions/sets, planned sessions, coaching records, preferences, social posts, friendships, reactions, comments and private custom exercises, while preserving shared exercises and other users.
- [ ] Complete a human screen-by-screen review of empty, loading, error, validation and success states across the dashboard, workout, Community and Coach areas. Automated loading/error/retry coverage has been added, but does not replace this full review. Follow `docs/manual-qa-checklist.md` and record evidence.
- [x] Automated responsive checks cover desktop, tablet portrait and mobile navigation, including mobile touch-target sizing. Keyboard-only sign-in navigation and visible focus styling are also covered.
- [ ] Complete a physical-device and screen-reader spot check on the target browsers/devices. Follow `docs/manual-qa-checklist.md`; these require a human using the actual devices and assistive technology. Automated viewport and keyboard tests are not a substitute.

### 2. Finish the exercise library experience
- [ ] Review all 101 exercise guides for factual accuracy, consistent terminology, useful instructions and appropriate regressions. The review order, rubric and evidence/sign-off requirements are recorded in `docs/exercise-catalogue-review.md`. Automated seed checks enforce content completeness and muscle-link consistency, but do not establish biomechanical accuracy.
- [ ] Verify primary/secondary muscle assignments and movement categories against a documented reference.
- [ ] Source and match suitable exercise stills or demonstrations individually. Record the exact source, creator, licence, attribution and modification history for every asset before use.
- [ ] Do not ship media with unclear rights. If appropriate media cannot be cleared, retain the text-first guide rather than using unverified assets.
- [ ] Check anatomy labels and diagram coverage with a credible anatomy reference; keep the illustration clearly labelled as an orientation aid, not clinical anatomy.

### 3. Expand the AI Coach and Community experience
- [x] Deliver a dedicated responsive Coach screen with private, persistent conversations, message history, send/reply, deletion and loading/error states; the current replies are transparently identified as rule-guided, not generative AI.
- [x] Scope coach conversation data to the authenticated account and pass only a small summary of recent completed workouts to the rule-guided service; exclude account identifiers, daily wellbeing logs and private workout notes.
- [x] Add an optional AI-generated reply path behind explicit consent, default-off preference storage and server-side key configuration; limit context, bypass injury/urgent-symptom requests, and retain guided fallback. Browser tests cover consent disclosure and saving/revoking the preference.
- [x] Allow deployment configuration of an OpenAI-compatible chat-completions endpoint without changing the coaching rules; keep the provider key server-side.
- [x] Add a 30-message-per-account hourly cap to Coach conversations and test that the next request is rejected before context lookup, persistence or provider work.
- [x] Add a PostgreSQL-backed shared rate-limit store for multi-instance deployment; integration tests verify cross-instance increments, stable reset times, concurrent increments, expiry, decrement and reset behaviour.
- [ ] Verify a live provider with an operator-supplied key, complete provider data-processing/retention review and broader safety evaluation before enabling external processing for real users.
- [x] Add a catalogue-based routine draft with goal, equipment, experience and weekly availability inputs; require review in the routine editor and an explicit save action.
- [ ] Add safe, evidence-grounded training adjustments after the model and evaluation approach are approved.
- [x] Add profile editing, private-by-default visibility, bounded friend discovery/search, friend-request/connection management, account blocking and private reports for visible posts/accounts. Blocking removes existing connections and prevents the blocked pair from viewing each other's profiles/feed activity or creating new friend requests.
- [x] Add route and browser coverage for report/block actions, plus PostgreSQL-backed account-deletion checks for block cascades, reporter deletion and anonymisation of reports about deleted users/posts.
- [x] Add server-enforced cursor pagination to the friends-only feed, with deterministic ordering, a bounded page size and visibility checks on every page.
- [x] Add moderator-only report queue, status transitions, reviewer timestamps and resolution notes; moderator identity is configured server-side and cannot be self-assigned.
- [x] Add a browser journey proving older posts append without replacing the current feed.
- [x] Deliver responsive workout/update cards, semantic timestamps, reaction counts, workout summaries, comment discussions, initial/empty/error states, refresh and pagination recovery, profile previews, and author-only post/comment editing and deletion.
- [ ] Complete the remaining human visual QA and refine any issues found; automated viewport/browser coverage does not replace physical-device and screen-reader checks.
- [x] Add first-page feed refresh with an accessible loading state, retry after failure and preservation of already loaded posts when refresh fails.
- [x] Give feed timestamps semantic `<time>` markup and separate discussion sections with explicit comment counts.
- [ ] Add image upload only after storage, access control, file validation, metadata stripping, deletion and media-rights decisions are implemented.
- [x] Deliver a private in-app activity inbox for friend requests, accepted requests, reactions and comments, with recipient-only access, blocked-actor filtering, unread count, individual/bulk read actions, cursor pagination with retry, and account/post deletion rules.
- [ ] Add notification preferences and optional push/email delivery only after explicit user permission, delivery infrastructure and permission-denied behaviour are designed.
- [ ] Follow `docs/product-expansion-roadmap.md` for the detailed delivery slices and acceptance criteria.

### 4. Complete the wider product experience
- [ ] Complete the full screen-by-screen visual redesign. The overview has direct training/Coach actions, the workout workspace prioritises the active session, exercise discovery has a cleaner search/filter hierarchy, Community prioritises the activity feed, and Coach prioritises the conversation. The full visual review of typography, spacing, media, active workout mode, forms and empty/error states is still open.
- [ ] Review visual consistency and content density across desktop, tablet and mobile, including active workout mode, dialogs, forms, charts, feed cards and empty/error states.
- [x] Inventory all 51 source, test, schema and migration files for comment coverage. No code file is left without rationale comments, and every automated test case has a nearby explanation of its purpose.
- [x] Complete the qualitative comment review across all 51 source, test, schema and migration files. Every automated test case has a nearby explanation of its purpose; comments focus on intent, constraints, data boundaries and non-obvious decisions rather than restating straightforward code.
- [ ] Conduct a structured usability evaluation with representative users after ethics approval where required.
- [ ] Fix issues found in onboarding, workout creation, guided workout use, exercise search, history and social flows.
- [x] Deliver the in-app activity inbox for social events; it does not send push notifications or email.
- [ ] Decide whether workout reminders or push/email delivery are in scope, then add user controls, explicit consent and permission-denied states.
- [ ] Review accessibility against WCAG 2.2 AA for contrast, focus, labels, keyboard use, touch targets, motion and screen-reader announcements. The muted caption token has been raised above 4.5:1 on the primary dark surfaces; this targeted improvement is not a full accessibility sign-off.
- [ ] Add clear account, privacy, data export and deletion explanations appropriate to the final project scope.

### 5. Production security and operations
- [ ] Replace local-storage bearer-token handling with Secure, HttpOnly, SameSite cookie sessions and implement CSRF protection. Review CORS, HTTPS and proxy configuration together.
- [ ] Add password reset and email verification if the intended deployment requires real public accounts; configure a trusted email provider and abuse controls.
- [ ] Review rate limits across login, registration, social actions and other write endpoints; add appropriate monitoring and audit events without logging secrets or sensitive content.
- [ ] Add production environment configuration, secrets management, database backup/restore procedure, migration deployment checks, health monitoring and error reporting.
- [ ] Deploy the frontend, API, database and coaching service to the chosen host; configure domains, TLS, CORS, service URLs and a repeatable release process.
- [ ] Run dependency and security checks, review privacy disclosures and complete a threat-model pass before exposing the service publicly.

### 6. University submission and evidence
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

The project should not grow indefinitely by adding features without reference to the assessment brief. In particular, push/email notifications, password reset/email verification, data export and public deployment depend on the intended final scope; the private in-app activity inbox is implemented. The priority is to keep stabilising and evaluating the training foundation while delivering the AI Coach and Community workstreams in controlled, testable slices.

## Current release status

The feature branch and pull request remain in draft and unmerged. The project is not yet a finished production service. The latest completed CI run is [42552848002](https://github.com/stevosantedev/FitloopProject/actions/runs/42552848002), and both application and coaching-service jobs passed (130 backend tests, 53 browser tests and 18 coaching-service tests). CI validates the Prisma migration history, exercise catalogue, frontend build, backend tests, service-worker syntax and browser journeys. Browser coverage verifies the Community feed-first order, unread inbox counts in desktop/mobile navigation, and Coach conversation-first order, including chat-before-history on mobile. The branch includes an optional, default-off AI reply path with consent, guided fallback, high-risk topic bypass and a PostgreSQL-backed shared message limiter; live provider operation and broader safety/data-retention evaluation remain outstanding. The Coach-first routine-draft journey loads the exercise catalogue before generation and confirms that the routine is saved only after explicit user action. The current product expansion continues in parallel across AI Coach and Community, while exercise-library review, media-rights checks and human QA remain quality work.


## Weekly training programme implementation

The Coach builds editable 2–6 day drafts from catalogue movement patterns, equipment, goal and experience. The backend stores an account-owned `TrainingPlan` with ordered `TrainingPlanDay` records and creates each day's routine and exercise links in one nested write. Users review every day's movements before saving; saved programmes can be edited, show an adjustable seven-day training/rest spread, and load individual days into the existing workout builder. Updating a plan creates replacement day routines so completed workout history remains linked to the original routine. The current split selects movements and structure only; it does not prescribe sets, reps or loads, schedule calendar events, or track weekly completion. The latest CI run 42546425468 passed both jobs; the weekly programme journey and backend ownership/validation paths remain covered by the current suite.
