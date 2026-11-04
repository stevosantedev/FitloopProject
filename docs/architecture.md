# FitLoop architecture

## The main pieces

FitLoop has three application parts. The React frontend is the screen a person uses. The Express API handles sign-in and makes sure each account can only reach its own private records. PostgreSQL stores those records, with Prisma keeping the database structure and relationships in one place.

The Python coach is a separate service. The API sends it a short window of recent measurements, and it returns a small set of suggestions with plain-language reasons. The API stores the messages so the project can later evaluate what the coach said and how people responded.

## Why keep the coach separate?

The first version uses transparent rules rather than a large language model. That makes it easier to explain what triggered a suggestion, test the rules with made-up data and change the coaching logic without rebuilding the rest of the app.

## A typical request

1. A person signs in and receives a short-lived token.
2. The browser sends the token when it requests private information.
3. The API verifies the token and uses its user ID to scope database queries.
4. Prisma reads or updates the matching records.
5. For a coach check-in, the API sends recent measurements to the Python service and stores the returned explanation.

The API does not trust a user ID supplied by the browser to decide whose records to read.

## Feature boundaries

- Daily check-ins are stored once per user per calendar date.
- Workout routines are reusable templates; sessions represent what was completed and can contain several exercises.
- Exercise definitions link to canonical muscle records, with primary and secondary roles. Training summaries weight those roles for a transparent volume estimate.
- A completed workout creates a feed post. The feed API returns posts from the signed-in user and accepted friends.
- Coach preferences change the wording and focus, not the underlying safety boundaries.
- Coach decisions are stored against the original message so the project can review whether suggestions were accepted or declined.

## Current limits

The workout logger supports multi-exercise session submission with per-exercise set counts, rep targets, loads, set categories, rest durations and RIR/RPE values. A manual countdown can be started from each exercise card. Individual set editing during a live session and a fully guided timer sequence are not yet implemented. Muscle-volume and time-since-training summaries are heuristics, not physiological assessments. Production session hardening, offline sync, notifications and broader automated tests remain future work.
