# Manual quality-assurance checklist

Last updated: 9 November 2026

This checklist records the checks that still require a person using a real browser, device or assistive technology. Automated CI is useful evidence, but it does not prove that the app is usable on every target device or with every screen reader.

## Before testing

- Use a non-production test account and synthetic data only.
- Record the browser, browser version, operating system, device model, viewport size and test date.
- Start with a clean account, then repeat key flows with an account that already has workouts, routines, friends and check-ins.
- Keep browser developer tools available so network failures can be simulated without changing production data.
- Do not use real participant data unless the required university ethics approval and data-handling arrangements are in place.

## Screen and state review

For each area below, check the initial load, a slow connection, a failed request, a successful retry, a genuinely empty account and an account containing records.

### Overview

- [ ] Loading feedback appears while profile, check-ins, coaching history and recent sessions are fetched.
- [ ] A failed request is clearly identified and the retry action reloads the overview.
- [ ] Offline reopening explains that cached profile information may be incomplete.
- [ ] A genuinely empty account sees helpful first-use messages, not error messages.
- [ ] An account with records sees the correct recent sessions, check-ins and weekly totals.
- [ ] Check-in validation, successful save feedback and refresh behaviour are clear.

### Workouts

- [ ] Loading feedback appears while the exercise catalogue, routines, sessions, muscle summaries and personal records are fetched.
- [ ] A failed request displays a useful error and retry action; it is not presented as an empty library or a new account.
- [ ] Offline catalogue fallback is distinguishable from unavailable routines and training history.
- [ ] Search and each filter remain usable; a genuine no-match result is distinguishable from a failed catalogue request.
- [ ] Routine creation, editing, deletion and cancellation are understandable.
- [ ] Guided workout start, set completion, rest, pause, skip, stop and final save are understandable.
- [ ] Invalid reps, load, rest and effort values receive actionable feedback.
- [ ] History, personal records, movement progress and muscle summaries distinguish no records from unavailable data.

### Community

- [ ] Loading feedback appears while friends and feed data are fetched.
- [ ] A failed friends or feed request shows an error and retry action.
- [ ] A genuinely empty friends list and an empty feed have useful first-use explanations.
- [ ] Friend request, acceptance, reaction and comment success/error feedback is visible.
- [ ] Private feed content is only shown to the expected account and accepted connections.
- [ ] Social and You remain separate workspaces, and the bottom navigation changes when the top switch changes.
- [ ] Feed shows friends' activity before secondary relationship management.
- [ ] Explore currently provides bounded people discovery only; do not expect public posts or video discovery yet.
- [ ] Pings clearly states that private messaging is not available; it must not imply that messages can be sent.
- [ ] The signed-in Profile shows only that member's own shared posts and workout summaries, offers profile editing and opens account settings.
- [ ] Profile history can load older posts independently of the friends feed.
- [ ] Profile content does not expose private session notes, wellbeing logs or account credentials.
- [ ] The friends' activity feed appears before friend management and blocked-account controls.
- [ ] The post composer remains easy to reach on desktop and mobile; character limits and friends-only audience copy are clear.
- [ ] Profile previews, report actions, block/unblock and friend-request controls remain understandable at narrow widths.
- [ ] Activity inbox shows friend requests, accepted requests, reactions and comments only to the recipient.
- [ ] Unread count updates after individual and bulk mark-as-read actions.
- [ ] Loading older inbox activity appends to the existing list without duplicates; a failed page request preserves loaded items and offers a retry.
- [ ] Notifications from accounts blocked in either direction are hidden; deleting an account removes its received inbox.

### Coach

- [ ] The Plan destination leads with the weekly programme builder, followed by progression guidance and the Coach conversation. The Coach remains reachable from Home and within Plan.
- [ ] Creating, switching, deleting and continuing conversations is clear and remains account-private.
- [ ] Guided replies are distinguishable from optional AI-generated replies.
- [ ] AI consent is off by default, can be enabled and revoked, and the data disclosure is readable before sending a message.
- [ ] Provider-unavailable, timeout and rate-limit responses preserve a usable guided-coaching path.
- [ ] The weekly programme builder makes it clear that the generated split is a draft, that each day must be reviewed, and that saving is an explicit action.

## Keyboard and assistive-technology review

- [ ] Complete sign-in, navigation, check-in, workout creation and community actions using only a keyboard.
- [ ] Focus order follows the visual and task order; no control traps focus.
- [ ] Focus indicators remain visible against every panel and modal background.
- [ ] Buttons, links, form controls and icon-only controls have meaningful accessible names.
- [ ] Loading updates are announced once and do not repeatedly interrupt the user.
- [ ] Errors are announced and can be found without relying on colour or visual position.
- [ ] Exercise selection, set completion, timer status and workout-save feedback are announced meaningfully.
- [ ] Check the application with VoiceOver on iOS/macOS and/or NVDA with Firefox or Chrome on Windows, depending on the supported evaluation environment.
- [ ] Verify zoom/text enlargement and reduced-motion settings do not hide content or actions.

## Physical-device and responsive review

- [ ] Test a real iPhone or iPad with Safari, including safe-area/notch behaviour and the fixed bottom navigation.
- [ ] Test a real Android phone with Chrome, including gesture navigation and touch targets.
- [ ] Check portrait and landscape orientation, scrolling, keyboard appearance and form submission.
- [ ] Check the app shell at desktop, tablet and narrow mobile widths without horizontal overflow.
- [ ] If installation is in scope, install the web app and verify launch, navigation and offline shell behaviour.

## Record the result

For each issue, record:

| Field | Evidence |
|---|---|
| Test ID / screen | |
| Device, OS and browser | |
| Account state / test data | |
| Steps to reproduce | |
| Expected result | |
| Actual result | |
| Severity and impact | |
| Screenshot / recording / console output | |
| Fix or follow-up issue | |
| Retest result and date | |

## Sign-off

- [ ] Screen-by-screen state review completed.
- [ ] Keyboard and screen-reader review completed.
- [ ] Physical-device review completed.
- [ ] Findings triaged and critical/high-priority issues resolved or explicitly accepted.
- [ ] Evidence stored with the university project test artefacts.

Do not mark these checks complete based only on the Playwright suite. The tester must perform them and record the evidence.
