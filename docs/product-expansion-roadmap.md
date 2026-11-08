# Product expansion roadmap: AI Coach and Community

Last reviewed: 8 November 2026

## Why these workstreams start now

The training foundation is sufficiently established to begin the next product areas. Exercise-content review, media-rights checks and manual device/accessibility QA remain important, but they are parallel quality activities rather than prerequisites for starting the AI Coach or Community work.

FitLoop already has an initial rule-based coaching service, coach preferences/history and a friends-only feed with reactions and comments. The next phase is an intentional expansion of those foundations into complete, coherent product experiences.

The work should be delivered in small vertical slices. Each slice includes its interface, API/data behaviour, privacy and safety decisions, failure states and automated tests. Avoid building decorative screens that are not connected to working behaviour.

## Workstream A: AI Coach

### Product direction

The coach should become a useful, ongoing training companion rather than a button that occasionally returns a generic check-in message. It should be able to use relevant FitLoop context—goals, training history, routines, logged performance and optional daily check-ins—to give specific, explainable help.

The existing Python rule-based coach remains a useful baseline and fallback. A language-model integration, if selected, must not silently replace tested safety and validation rules. Keep the model provider behind a server-side adapter so the application is not coupled to one vendor.

### Delivery slices

1. **Coach experience and conversation foundation**
   - [x] Add account-owned conversation and message persistence, list/read/delete API routes, bounded conversation titles, chronological message retrieval and owner checks.
   - [x] Build the dedicated responsive Coach destination with conversation history, message composer, loading/error states, retry action and deletion.
   - [x] Add a first message/reply pipeline using a clearly disclosed, deterministic rule-guided service; only a small summary of recent completed training is sent to it.
   - [x] Keep the existing check-in suggestion flow available alongside conversations.
   - [x] Disclose the exact categories of training context sent with each message, including the five-session limit and the exclusion of private notes, wellbeing logs and account identifiers; verify the disclosure in the Coach browser journey. Backend projection tests also verify the five-session bound and prove private session notes, wellbeing entries and account identifiers cannot enter the coaching-service payload.
   - [ ] Integrate a generative model through a provider-neutral server adapter only after model/provider choice, explicit user consent, data-protection review, safety evaluation and cost controls.
   - The current conversation feature is a guided rules-based preview, not a generative AI coach. The interface discloses this distinction.

2. **Grounded FitLoop context**
   - Define a minimal, typed context package assembled by the API for the authenticated user.
   - Include only relevant information and an explicit time window; distinguish missing data from zero.
   - Ground training answers in actual logged sessions, exercise catalogue records and stated goals.
   - Show which FitLoop information informed a recommendation; do not invent workouts, records or user history.

3. **Training assistance**
   - Explain exercises and training concepts using the reviewed first-party catalogue.
   - Help draft routines and suggest adjustments, with the user confirming changes before they are saved.
   - Explain progress trends without presenting heuristic muscle-volume estimates as physiological facts.
   - Ask a clarifying question when goals, equipment, experience or constraints materially affect the answer.

4. **Safety, privacy and evaluation**
   - Define prohibited and escalation topics; do not diagnose injuries or illnesses or prescribe treatment.
   - For pain, injury, disordered eating, medication or other high-risk topics, respond conservatively and direct users to appropriate qualified support.
   - Minimise context sent to any external model, exclude direct identifiers, document retention and provider settings, and make AI use clear to users.
   - Add deterministic tests for context scoping, prompt-injection resistance, unsupported claims, unsafe requests, timeouts, provider failures and deletion.
   - Evaluate response quality against a documented set of synthetic scenarios before enabling real user data.

### AI Coach MVP exit criteria

- A signed-in user can start, continue, revisit and delete a conversation.
- Replies use only the authenticated user's permitted context and identify relevant supporting FitLoop data.
- The user can request a routine draft or adjustment and must confirm before it changes saved training data.
- Existing rule-based coaching remains available if the model provider is unavailable.
- Safety, privacy, failure and account-isolation tests pass.

## Workstream B: Social Community

### Product direction

The community should feel like a modern fitness social product, with a visual activity feed and meaningful user profiles. The aim is not to clone another app's branding or interface, but to deliver familiar social behaviours in a FitLoop-specific way.

The current friends-only feed, workout posts, reactions and comments provide a starting point. Expand them without weakening the default privacy boundary.

### Delivery slices

1. **Feed experience**
   - [x] Create friends-only text updates from the Community screen, with a 500-character limit and a clear accepted-friends audience notice.
   - [x] Allow authors to delete their own posts; the API scopes deletion to the authenticated author and database cascades remove associated reactions/comments.
   - [x] Allow authors to edit their own text updates with strict 500-character validation; the API hides other users’ posts and immutable workout summaries behind author/type checks.
   - [x] Add API validation and route tests for text post creation, blank/overlong content and author-only deletion; add a browser journey for composing and sharing an update.
   - [x] Expand the feed into responsive cards for completed workouts and user-created updates, with author identity, semantic timestamps, reaction counts, workout summaries and comment discussions.
   - [x] Add an explicit first-page feed refresh action; a failed refresh preserves the currently rendered posts and exposes an accessible retry.
   - [x] Present machine-readable post timestamps and a clearly labelled comment count/section on each feed card.
   - [x] Add cursor-based pagination with a bounded page size, deterministic ordering, a look-ahead query and server-side visibility checks on every page.
   - [x] Complete deliberate loading, empty, error and retry states for the feed journey; browser coverage verifies initial-load failure recovery to a genuine empty state, failed first-page refresh recovery and older-post/comment pagination retries.
   - [ ] Add optimistic reactions only where failures can be rolled back accurately.
   - Image uploads remain out of scope until private media storage, file validation, metadata stripping, access control and deletion are implemented.

2. **Profiles and relationships**
   - [x] Add account-owned display name and short bio editing, with bounded validation and no exposure of email or credentials.
   - [x] Show a consistent author identity in feed posts and friend lists using the chosen display name and a generated initial avatar.
   - [ ] Add uploaded avatars and chosen training highlights only after private media storage, file validation, metadata stripping and deletion controls are ready.
   - [x] Profile visibility controls with private-by-default handling; public profile payloads expose only display identity and bio, while private profiles are limited to owners and accepted friends.
   - [x] Add incoming-request decline, outgoing-request cancellation and accepted-friend removal, with server-enforced ownership/status checks and Community actions.
   - [ ] Friend discovery/search and suggestions; request, accepted-connection and pending-state management is implemented.
   - Follow relationships only if they add value beyond the existing friend model; avoid duplicating relationship concepts without a product decision.

3. **Post creation and media**
   - Create text updates and share completed workouts with an explicit audience preview.
   - Add image upload only after selecting storage, file-size/type limits, metadata stripping, access control and deletion behaviour.
   - Do not expose private workout notes, daily wellbeing logs, exact location or other sensitive fields in feed payloads.
   - Use owned or properly licensed media only.

4. **Community quality and safety**
   - [x] Edit/delete own text-update posts and comments with server-enforced author ownership, strict input validation and browser/API regression tests; workout-summary posts remain immutable.
   - [x] Report visible posts and user accounts with a bounded reason/details schema and private moderation records.
   - [x] Restrict report queue and decisions to deployment-allowlisted moderators; expose only minimal reporter/target identities.
   - [x] Block/unblock accounts; blocking removes existing connections and hides each account's profiles, feed posts and new friend requests from the other.
   - [x] Build allowlisted moderator review, status triage and resolution API/UI with reviewer timestamps and required resolution notes; retain a full immutable event ledger as future hardening.
   - Add moderation status and an auditable handling process before opening discovery beyond accepted friends.
   - Rate-limit post, comment, reaction, friend-request and report endpoints.

### Community MVP exit criteria

- [x] Users can create friends-only text updates; authors can delete their own posts.
- [x] Users can view, select/change/remove their own reactions, and comment on permitted posts; cursor-based pagination loads older visible posts.
- [x] Deliver the core feed presentation and comprehensive loading/error/retry states: workout summary cards, author-only comment management, comment pagination, reaction toggles, accessible profile previews, keyboard focus containment, privacy-safe unavailable-profile handling, request lifecycle protection, resilient first-page refresh, semantic timestamps and labelled comment counts. Remaining visual refinement is tracked as product QA rather than a blocker for the implemented slice.
- Feed and profile APIs enforce audience and relationship rules on the server, not just in the UI.
- [x] Users can manage their profile and relationships and can report or block another account.
- Pagination, media failure, empty states and permission changes are tested.
- No private wellbeing, workout-note or account data leaks into public/community responses.

## Shared product foundations

- **Navigation and app feel:** coach and community become first-class app destinations, with consistent mobile navigation and desktop workspace patterns.
- **Design system:** shared typography, spacing, cards, avatars, media treatment, loading skeletons, toasts and accessible interaction states.
- **Notifications:** introduce an in-app activity inbox first; add push/email only after preferences, consent and permission-denied behaviour are designed.
- **Privacy controls:** explain who can see each item at creation time and provide a way to review or change visibility later where appropriate.
- **Observability:** record operational events and errors without logging message contents, tokens or sensitive user data.
- **Accessibility:** keyboard and screen-reader flows, contrast, focus, reduced motion and touch targets are part of each feature's acceptance criteria.

## Recommended delivery order

| Order | Work | Reason |
|---|---|---|
| 1 | Coach conversation foundation and social feed visual refresh | Both are core differentiators; start in parallel after the current training foundation. |
| 2 | Grounded coach context and profile/relationship improvements | Makes coaching specific and gives community posts a meaningful identity. |
| 3 | Routine assistance with user confirmation and rich post creation | Connects coach recommendations to training and makes the feed useful. |
| 4 | AI evaluation/safety and community moderation/report/block | Required before wider use and broader discovery. |
| 5 | In-app activity inbox, then optional push notifications | Add engagement only after core interactions and user controls are reliable. |

A practical implementation approach is to finish one end-to-end vertical slice at a time, alternating between the two workstreams where dependencies allow. Do not wait for the entire exercise catalogue review to finish before starting either stream.

## Dependencies and decisions to resolve during implementation

- Choose whether a hosted language model is permitted by the project budget, data-protection requirements and assessment scope. Keep a provider-neutral adapter and a deterministic fallback.
- Decide whether AI conversations are retained by default, how long they are retained and how users delete them.
- Choose private media storage and signed access URLs before implementing image upload.
- Define profile visibility and post audiences before adding public discovery.
- Confirm university ethics requirements before recruiting evaluators or collecting identifiable participant data.

## Definition of done for each slice

A slice is complete only when its user journey works end-to-end; API ownership and privacy rules are enforced; loading, empty, error and retry states are usable; accessibility is checked; automated tests cover success and failure paths; and the relevant documentation is updated. A visual mock-up or disconnected front-end screen does not count as completion.
