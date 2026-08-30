# AI tooling

Codex was used as a development assistant for this project. The project author
should review and understand the generated work before submitting it.

## How AI was used

- Read the supplied SRS and project rubric, then built a requirement checklist.
- Compared the planned Docker layout with relevant Allowly patterns.
- Created the React, Flask, PostgreSQL, Caddy, and Docker Compose foundation.
- Implemented and checked the five pages, newsletter signup, availability, and
  reservation workflow.
- Prepared the B2-level architecture workbook and short decision comments.
- Reviewed the frontend/backend contract and tested database concurrency.
- Added the four restaurant images supplied with the assignment.

## What worked well

- Turning the SRS into a checklist kept page content, booking rules, and Docker
  boundaries consistent.
- Short code comments and the architecture workbook made important decisions
  easier to review.
- Mutation testing found behavior changes that normal passing tests did not
  detect.

## What needed correction

- Temporary AI-generated image drafts were replaced when the supplied image
  collection became available.
- The first reservation tests used database mocks and missed broken capacity,
  SQL, validation, and response behavior. Exact contract checks and a real
  PostgreSQL capacity and concurrency test were added.
- The demo guide originally described a kitchen image that is not in the
  supplied collection. Its gallery wording now matches the four shipped files.

## Image sources

The final application uses these four files from the assignment image
collection:

1. `home-cafe-fausse.webp`
2. `gallery-cafe-interior.webp`
3. `gallery-ribeye-steak.webp`
4. `gallery-special-event.webp`

AI-generated restaurant images were created as temporary drafts before the
supplied collection was available. Those drafts were removed and are not used
or shipped by the final application.

## Human review points

- Confirm that all restaurant content matches the supplied SRS.
- Run the tests and complete the five-page demo before submission.
- Replace the local password and add HTTPS before any shared deployment.
- Decide how to handle cancellations, data retention, backups, and newsletter
  delivery before using the app as a public service.
