# Privacy and safety

FitLoop can store sleep, mood, activity and focus information. Even when the app is being built for a university project, treat those records as personal information.

## Before inviting participants

- Get the required university ethics approval first.
- Explain what the app collects, why it is collected and how long it will be kept.
- Use pseudonymous accounts wherever possible.
- Collect only the fields needed for the feature being evaluated.
- Give participants a clear way to ask for their account and records to be deleted.
- Keep real participant information out of source control, screenshots and test fixtures.

## How the coach handles data

The API sends the coach a short window of recent measurements. It does not send names, email addresses or account identifiers. Keep the coach service on a private network rather than exposing it directly to the public internet.

The coach uses simple rules and explains which measurements informed each suggestion. It is a habit reflection tool, not a medical service. It must not diagnose conditions, interpret mood as a mental-health assessment, prescribe treatment or create strict diet plans. A person can ignore a suggestion.

## Deployment safeguards still needed

The local development setup uses bearer tokens for simplicity. Before a public release, move to secure session handling, HTTPS, stronger operational monitoring and a tested account deletion process. Set a clear retention period and check that deletion covers the database records and any backups or exported data covered by the project policy.

Never commit the real `.env` file or share access tokens in chat, issue descriptions or screenshots.
