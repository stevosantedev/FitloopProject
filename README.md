# FitLoop

FitLoop is a fitness and daily wellbeing app for people whose routines change from week to week. It brings daily check-ins, workout tracking, a friends feed and an explainable coaching service into one place.

The first release is being built around a small set of features that can be tested properly. The coach uses clear rules and recent trends. It does not diagnose conditions or replace professional advice.

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

1. Copy `.env.example` to `.env` and replace the example JWT secret with a long random value.
2. Create a local PostgreSQL database and update `DATABASE_URL`.
3. Install JavaScript dependencies with `npm install`.
4. Run `npm run db:generate` and `npm run db:migrate`.
5. Start the app with `npm run dev`.
6. Set up the coach in a Python virtual environment, install `coach/requirements.txt`, then run `uvicorn main:app --app-dir coach --reload --port 8000`.

The frontend runs on port 5173, the API on port 4000 and the coach on port 8000.

## Development

- `npm run dev`: frontend and backend.
- `npm run build`: frontend production build.
- `npm test`: backend tests.
- `npm run db:generate`: generate Prisma client.
- `npm run db:migrate`: apply local database migrations.

## Current implementation status

The repository already contains the first relational data model. This branch adds the first API, frontend shell and rule-based coach foundation. Social workflows, workout routine management, richer analytics, coach approval flows, account deletion and deployment hardening still need implementation and testing.

## Privacy

Sleep, mood and activity logs are personal information. Keep the database private, use HTTPS outside local development, and never commit real environment files. The coach receives only recent measurements, not names or email addresses.

Read [the architecture notes](docs/architecture.md), [development guide](docs/development.md) and [privacy notes](docs/privacy.md) before using real participant data.
