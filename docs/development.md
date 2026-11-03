# Local development

Install Node.js 20+, npm 10+, Python 3.11+ and PostgreSQL 15+. Create a local database and set its connection string in `.env`.

1. Copy `.env.example` to `.env`.
2. Replace the example JWT secret with a random value of at least 32 characters.
3. Install JavaScript packages with `npm install`.
4. Generate the database client using `npm run db:generate`.
5. Apply the local schema using `npm run db:migrate`.
6. Start the frontend and API using `npm run dev`.
7. In another terminal, create a Python virtual environment, install `coach/requirements.txt`, and run `uvicorn main:app --app-dir coach --reload --port 8000`.

The coach must be running before the coaching endpoint can return suggestions. Account and daily logging routes do not depend on it.

Useful checks:

- `npm test` runs backend tests.
- `npm run build` creates the frontend production build.
- `GET /health` checks the API.
- `GET http://localhost:8000/health` checks the coach.
