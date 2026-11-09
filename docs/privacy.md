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


## Offline workout data

When offline recording is used, completed workout submissions are temporarily stored in the browser's IndexedDB database until the API confirms receipt. Each queued item is associated with the account that created it; FitLoop does not store an authentication token in the queue. The exercise catalogue is cached separately per account in local browser storage to allow the workout builder to reopen offline. These local copies remain on the device until browser data is cleared or the app removes them. Unsynced workouts can be lost if the user clears site data, uninstalls the browser profile, or loses the device. Do not use a shared or public device for private workout logging.

## Optional AI coaching

FitLoop's guided coaching service can generate a reply through an OpenAI-compatible chat-completions endpoint only when the account owner has enabled AI coaching and the deployment has configured a server-side API key. AI processing is off by default. The endpoint URL and model are deployment settings; the browser never receives the provider key.

For an eligible message, the coaching service receives the message, the user's coaching tone and focus, and up to five recent completed workout summaries. Those summaries contain session dates, routine names and exercise names, reps and recorded external loads. Account identifiers, email addresses, private workout notes and daily wellbeing check-ins are excluded. Messages about urgent symptoms or injury bypass the external provider and use the conservative guided response.

Conversation messages are stored in the FitLoop database until the user deletes the conversation or deletes their account. The account-deletion flow removes owned coaching conversations and messages. This does not by itself define the external provider's retention period: the selected provider's data-processing terms, logging, region and retention controls must be reviewed before enabling the live integration for real users. The current project has not verified a live provider account or completed that independent review.
