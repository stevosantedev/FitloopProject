# Product expansion roadmap: AI Coach and Community

Last reviewed: 5 November 2026

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
   - Dedicated coach destination with conversation history, clear message states, retry behaviour and a useful empty state.
   - Persist conversations and messages with strict account ownership.
   - Support user correction, feedback and deletion of conversations.
   - Keep the existing check-in suggestion flow available while the conversational flow is developed.

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
   - Rich, responsive feed cards for completed workouts and user-created updates.
   - Clear author identity, timestamps, post detail, reaction counts and comment previews.
   - Cursor-based pagination and deliberate loading, empty, error and retry states.
   - Optimistic reactions only where failures can be rolled back accurately.

2. **Profiles and relationships**
   - User profile with display name, avatar, short bio and chosen training highlights.
   - Profile visibility and audience controls with private-by-default handling for sensitive details.
   - Friend discovery/search, requests, accepted connections and clear pending states.
   - Follow relationships only if they add value beyond the existing friend model; avoid duplicating relationship concepts without a product decision.

3. **Post creation and media**
   - Create text updates and share completed workouts with an explicit audience preview.
   - Add image upload only after selecting storage, file-size/type limits, metadata stripping, access control and deletion behaviour.
   - Do not expose private workout notes, daily wellbeing logs, exact location or other sensitive fields in feed payloads.
   - Use owned or properly licensed media only.

4. **Community quality and safety**
   - Edit/delete own posts and comments; prevent duplicate or unauthorised actions.
   - Report content and users, block/mute accounts, and hide blocked users' content consistently.
   - Add moderation status and an auditable handling process before opening discovery beyond accepted friends.
   - Rate-limit post, comment, reaction, friend-request and report endpoints.

### Community MVP exit criteria

- Users can create, view, react to and comment on permitted posts.
- Feed and profile APIs enforce audience and relationship rules on the server, not just in the UI.
- Users can manage their profile and relationships and can report or block another account.
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
