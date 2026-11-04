# FitLoop

FitLoop is a fitness and daily wellbeing app for people whose routines change from week to week. It brings daily check-ins, workout tracking, a friends feed and an explainable coaching service into one place.

The idea is straightforward: make it easier to notice patterns and keep going, without turning everyday habits into another source of pressure. The coach explains why it has made a suggestion, and users can say whether that suggestion was useful.

## What is in the project

- **Daily check-ins:** sleep, steps, mood and focused work or study time.
- **Workout tracking:** a structured exercise catalogue, reusable routines, multi-exercise sessions and muscle training summaries.
- **Community:** friend requests, accepted connections, a friends-only feed, reactions and comments.
- **Explainable coach:** a separate Python service that reviews recent check-ins and returns messages with reasons.
- **Coach controls:** choose a gentle or direct tone, choose a focus area and record whether a message was helpful.
- **Progress view:** recent habit charts and a breakdown of completed sets by muscle group.

## Development standards

Read [the implementation standards](docs/implementation-standards.md) before extending the exercise library, muscle maps or other substantial features. It defines the expected code-comment detail, writing style, exercise-library and muscle-map requirements, and definition of done.

## Project structure

- `frontend/`: React app and browser interface.
- `backend/`: Express API, Prisma data access and account security.
- `coach/`: Python service for explainable coaching suggestions.
- `docs/`: architecture, setup and privacy notes.

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

The frontend runs on port 5173, the API on port 4000 and the coach on port 8000. The coach must be running before the coaching check-in button can return suggestions.

## Useful commands

- `npm run dev`: start the frontend and backend.
- `npm run build`: check backend JavaScript syntax and create the frontend production build.
- `npm test`: run the backend Node.js test command.
- `npm run db:generate`: generate the Prisma client.
- `npm run db:migrate:dev`: create a reviewed migration after changing the Prisma schema.
- `npm run db:migrate:deploy`: apply checked-in migrations to a database.
- `npm run db:migrate:status`: show migration status.
- `npm run db:push`: update a disposable local database without creating a migration (development only).
- `npm run db:seed`: add the starter exercise library.
- `pytest coach/test_coach.py`: run the Python coaching tests.

## Current status and known gaps

The first application flow is in place, including daily check-ins, routine creation, workout logging, friends, a feed and coach feedback. The exercise data model now supports structured instructions, aliases, movement patterns, equipment alternatives, media attribution and explicit primary/secondary muscle relationships. The first-party seed now contains 81 exercise definitions and 31 canonical muscle records, with primary and secondary muscle mappings. The app includes exercise technique cards, a selectable front/back muscle explorer with individual muscle-shape highlighting, and 30-day weighted-set summaries. This is a growing first-party reference library, not an exhaustive catalogue or clinical anatomy resource. The project still needs broader end-to-end tests, stronger production authentication, notifications, offline sync and a proper usability evaluation.

The workout logger supports multi-exercise sessions with editable rows for each set, including individual reps, load and completion state. Each exercise also has its own set type, rest duration and RIR/RPE settings. The API validates unique set numbering and per-exercise limits. A guided rest sequence can advance through completed sets, with pause, skip and stop controls. The progress charts are simple summaries of logged data, not medical or performance assessments.

## Privacy and safety

Sleep, mood and activity logs are personal information. Keep the database private, use HTTPS outside local development, and never commit real environment files. The coach receives recent measurements only; it does not receive names or email addresses.

Do not collect real participant data until the required university ethics approval, retention rules and deletion process are in place. Read [the architecture notes](docs/architecture.md), [development guide](docs/development.md) and [privacy notes](docs/privacy.md) before using the project.
