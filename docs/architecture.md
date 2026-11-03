# FitLoop architecture

## Application parts

The frontend is a React browser app. It sends requests to the Express API, which verifies the signed-in user's token before reading or changing private records. PostgreSQL stores accounts, daily logs, workout routines, workout sessions, social records and coach events through Prisma.

The Python coach runs as a separate internal service. The API sends it a short window of the signed-in user's measurements. It returns suggestions with plain-language reasons, and the API stores the messages so a later evaluation can inspect what the user saw.

## Why the coach is separate

The first coach is rule-based. Keeping it behind a small HTTP interface means its rules can be tested without the browser or database. It also gives the project room to change the analysis later without rewriting account and logging features.

## Request flow

1. The user signs in and receives a short-lived signed token.
2. The browser sends that token with private API requests.
3. The API reads the user ID from the verified token, rather than trusting an ID supplied by the browser.
4. Prisma scopes reads and writes to that user.
5. For a coaching check-in, the API sends recent measurements to the coach and stores the returned message and reasons.

## Current limits

The database model includes routines, sets, friend requests and feed content. The API and interface do not yet implement every one of those features. In particular, workout session flows, friend approval, feed visibility checks, coach decision controls and account deletion need their own routes and tests before real users are invited.
