# Gaia Phase 5: Deployment and Polish

Phases 1 to 4 built the SRS features. This phase made the prototype ready to demonstrate: a public deployment, demo data, and fixes found by reviewing the first four phases. It was not planned in advance, so this note records what changed and why.

## Deployment

- One Express service serves the API (under `/api`) and the built React client, so the live site has a single address and Socket.IO stays on the same origin. See `server/src/web.js`.
- `render.yaml` describes the Render web service. Starting it applies the migrations, seeds the district, and starts the server. The database is a hosted Neon Postgres.
- The seed script takes the admin password from the `ADMIN_PASSWORD` setting, so the public site does not use the well-known development password.
- `server/scripts/seed-demo.js` adds demo accounts, resource counts and referrals when `SEED_DEMO=true`, so graders and the demo video have realistic data.

## Facility data

- The seed loads 29 real healthcare facilities in Gasabo district instead of two placeholders. Each has a type and a sector.
- The facility list returns each facility's latest bed, specialist and supply counts, and the Dashboard can filter the "Refer a patient" list by the resource the patient needs.

## Fixes and additions from the Phase 4 review

- Account creation and password reset are limited to the admin's own district.
- Usernames are trimmed, and passwords must be at least 7 characters.
- Staff are deactivated instead of deleted, so their referrals and audit history are kept (NFR 6, auditability).
- Declining a referral requires a reason, and the district report shows the decline rate, the reasons, and which facilities decline most. This supports the SRS hypothesis about redirected referrals.
- A referral's resource is one of bed, specialist or supply, and the form asks for a patient reference rather than a name (data protection).
- Backend tests run against their own `gaia_test` database instead of filling the development database.

## Interface

- Logo, two-panel login page, navigation bar with icons, light and dark themes, and small animations that respect the reduced-motion setting.
- Logins survive a page refresh until the token expires.

## Still not built

- Kinyarwanda translation (SRS localization requirement). It needs a native speaker for the clinical terms.
- A real SMS gateway. The fallback is a logged stub.
- Immediate cut-off of a deactivated user's open session. It takes effect at the next login.
