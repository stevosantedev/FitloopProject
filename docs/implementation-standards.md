# FitLoop implementation standards

This document records the product and code-quality requirements for the next FitLoop development stages. Keep it updated as features are implemented so the documentation describes the code that is actually in the repository.

## Writing style

Use the project's writing guidance below when editing prose. The source guide is [Humanizer](https://github.com/blader/humanizer/blob/main/SKILL.md). Apply it to README text, documentation, comments, commit messages and user-facing copy.

- Write in plain, natural technical English. Keep the tone appropriate to the audience: neutral and precise in code, API and architecture documentation.
- Preserve the actual meaning and every supported technical detail when editing prose. Do not invent behaviour, test results, metrics, citations or implementation status.
- Remove filler, repeated conclusions, inflated claims, canned transitions and formulaic wording.
- Vary sentence length where it helps readability. Use headings only when they help someone find information.
- Keep user-facing copy direct and understandable. Explain what a feature does without marketing language.
- Treat the skill as a guide for prose, not as permission to change code, commands, paths, configuration, identifiers or data.

## Source-code comments

FitLoop is a university project that should be understandable to a developer opening an unfamiliar file. Comments must explain the code close to where the relevant code appears.

### File-level context

At the top of substantial modules, explain:

- What responsibility the file owns.
- Which layer calls it and which layer it depends on.
- Important assumptions, boundaries or invariants that are not obvious from the imports and names.

### Section and function context

Before each substantial function, handler, component or non-trivial block, explain:

- What it does and when it is used.
- What input it expects and what it returns or changes.
- Important validation, ordering or state assumptions.
- Side effects such as database writes, network requests, browser storage or feed publication.
- Relevant failure paths and why they are handled that way.

### Explain dense logic close to the code

Use short, specific comments beside non-obvious statements or small groups of statements. Explain:

- Why a particular condition, calculation or query is needed.
- What a transformation does, including units and boundary values.
- Why a database relation, transaction or ownership check is structured that way.
- What asynchronous work is waiting for and what can fail.
- What a state update preserves or prevents.
- Any security, privacy, accessibility or data-integrity consequence.

A reader should be able to follow a complicated function from its comments without having to infer the purpose of every branch. Add comments at the decision points, not as a wall of prose at the top of the function.

### Comment frequency benchmark

Use the supplied `dashboard.js` example as the density reference. FitLoop code should have explanatory comments throughout substantial functions: file context, function context, and short explanations between meaningful stages. A reader should not need to scroll through a long handler and infer why each group of statements exists.

- Add a short explanation before each meaningful phase of a longer function (input collection, validation, lookup, transformation, persistence, response and cleanup where present).
- Explain each non-obvious branch, early return, fallback, sorting rule, threshold, retry decision and state transition close to the code.
- For database work, explain ownership filters, selected fields, ordering, transaction boundaries and why records are created, updated or deleted in that order.
- For frontend work, explain state ownership, asynchronous request ordering, stale-response protection, accessibility behaviour and why UI state is reset or preserved.
- For tests, explain the behaviour or regression being protected, the setup that makes the case meaningful and what the assertions prove. Avoid comments on every assertion when the test name already makes it clear.
- For migrations and seed data, explain compatibility assumptions, defaults, constraints and intentionally conservative or incomplete mappings.
- Add a comment whenever the reader reaches a new logical phase or a decision whose reason is not obvious. Small, self-explanatory helpers do not need filler comments.

### Comment quality

- Prefer useful explanations over restating the syntax. For example, explain why a query is scoped to the authenticated user, rather than writing "find the user".
- Keep comments accurate when code changes. Remove comments that no longer describe the implementation.
- Do not add a comment to every obvious assignment, import or return statement. Add one wherever intent, consequence or a non-obvious step would otherwise be unclear.
- Explain surprising behaviour and trade-offs, not things already clear from a descriptive name.
- Use natural wording. Avoid repetitive templates, dramatic claims and generic comments such as "This is important".
- Keep TODO comments actionable and link them to an issue where one exists. Do not use TODO as a substitute for documenting unfinished work.

## Exercise library and muscle-map requirements

The exercise catalogue and muscle-map experience are core FitLoop features. Build them as first-party product capabilities, with a broad, structured exercise dataset and useful training visualisations. The current 14-record starter list is only a temporary foundation and must be expanded substantially.

### Exercise catalogue

The catalogue and its data model should support, where source data is available:

- Stable exercise identity and canonical name.
- Aliases and searchable descriptions.
- Primary/target muscles and secondary muscles.
- Body region or body part.
- Equipment and equipment alternatives.
- Exercise category and movement pattern.
- Step-by-step instructions and coaching cues.
- Difficulty or experience level when supported by reliable source data.
- Media demonstrations (image, GIF or video), with source and licence attribution.
- Custom exercises with user ownership and private media.
- Filtering, sorting and search across the supported metadata.

Do not fabricate exercise instructions, muscle targets, media or difficulty ratings to make the catalogue look complete. Track missing or uncertain fields explicitly.

### Muscle maps

The muscle-map experience should support:

- Front and back anatomy views.
- Clear, individually selectable muscle regions.
- Primary and secondary muscle highlighting for an exercise.
- Muscle-volume summaries derived from completed workout sets.
- Recovery estimates with the assumptions visible to the user.
- Muscle groups that have not been trained within a selected date range.
- Accessible labels and a non-visual alternative to selecting a muscle on the diagram.

Do not present recovery estimates as medical facts. Explain the calculation and its limitations.

### Workout workflow

The workout workflow should include multi-exercise sessions, guided logging, rest timers, set types, per-exercise rest settings, workout history and editing. Additional FitLoop features should integrate with the existing friends feed and explainable coaching service without weakening account privacy.

### Data and licensing

Before importing catalogue records, exercise media, anatomical paths or implementation code from an external project, verify the licence for that specific material. Keep attribution and licence notices with the relevant assets or data. Do not assume an external repository's top-level licence covers every asset or dataset. Record the source, applicable licence and required attribution for each imported component. Prefer independently authored implementation and properly licensed source data.

## Definition of done

A feature is not complete merely because its screen renders. Check that:

1. The API validates inputs and scopes private records to the authenticated account.
2. The database model represents the data needed by the feature without hiding important relationships in unstructured text.
3. Loading, empty, invalid and failure states are handled in the interface.
4. The feature works on narrow and wide screens.
5. Tests cover the main behaviour and important edge cases.
6. Comments explain the non-obvious code paths and are accurate.
7. User-facing and developer-facing prose follows the writing guidance above.
8. Documentation describes the behaviour that is actually implemented.


## Mobile-first interface work

FitLoop is designed as a phone app that also works in a desktop browser. Treat the phone layout as the primary experience when changing navigation or screen composition.

- Keep the Social and You workspaces reachable through a persistent top switch. Their context-sensitive bottom tabs expose Feed, Explore, Pings and Profile in Social, and Home, Workout, Stats, Plan and Library in You.
- Give the first screen of each destination a clear primary task. Avoid leading with settings, long explanations or secondary management forms.
- Keep workout controls usable with one hand and prevent the keyboard, tab bar or device safe areas from covering important actions.
- Use full-width mobile sections where they improve reading and interaction. Avoid shrinking desktop columns into narrow cards.
- Keep desktop layouts useful, but do not let desktop navigation or page structure dictate the phone experience.
- Check actual browser screenshots at narrow phone, standard phone, tablet and desktop widths. A passing overflow test alone does not prove that the screen is usable.
- Keep the same account permissions, validation and data behaviour across screen sizes. Responsive styling must not hide a feature's only route of access.

For each visual change, add a nearby code comment explaining the layout decision when it is not obvious from the selector or component name. Add a browser assertion for important navigation, hierarchy, touch-target or overflow behaviour. Update the README and project status when the change affects the product description or completion plan.
