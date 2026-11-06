# RNIG investment workspace

Early-stage TanStack Start application on Cloudflare Workers. See [the architecture](docs/architecture.md) and [build brief](BUILD-BRIEF.md) for scope and unresolved financial rules. The development app records members, share events, individual loans, repayments, credit bookings, investments, valuations and transactions. It also provides dated activity reports, an admin-only manual ledger, investment-policy ranges, collateral, sale requests and recorded trade facts, anonymous notices and a private self-service view for explicitly linked member accounts. Administrators can explicitly post loan disbursements, repayments and investment transactions using selected accounts, and can reverse those postings. Loan balances and interest are not calculated automatically. The selected account mappings must be approved before use. Recorded trade facts do not execute settlement or change share ownership; valuation comparisons use explicitly selected observations and do not establish an accounting gain.

## Local development

1. Install dependencies with `npm ci`.
2. Copy `.dev.vars.example` to `.dev.vars` and replace the example secret with a random value of at least 32 characters. The URL defaults to `http://localhost:3000`.
3. Apply local migrations: `npx wrangler d1 migrations apply rnig-investments --local`.
4. Set `PROVISION_EMAIL` and `PROVISION_PASSWORD` in your shell (minimum 12 characters), optionally `PROVISION_NAME`, then run `node scripts/provision-user.mjs --local --admin` to create a local test administrator. The script uses Better Auth password hashing and removes its temporary SQL file. Use test-only credentials locally. Omit `--admin` to create a local account without administrator access; the option is rejected for remote provisioning.
5. Run `npm run dev`, then open `http://localhost:3000`.

To use an isolated local database, pass `--persist-to <directory>` when applying migrations and set `RNIG_LOCAL_STATE` to the same directory for provisioning and the development server. If port 3000 is already in use, stop the old server before starting another: the local authentication URL is configured for port 3000.

Public registration is disabled at the authentication endpoint. Email verification is intentionally disabled during development; enable a verified email delivery flow before onboarding actual members. Administrators can issue a one-use, 24-hour member invitation and share the link privately; no invitation email is sent automatically. There is no password reset flow yet. The local test account created during development is `test@rnig.example` with password `RNIG-test-2026-only!`; it is not created automatically in other environments.

The deployed development workspace is at [investments.fidexa.org](https://investments.fidexa.org). Its separate test administrator is `demo-admin@rnig.example`; its password is shared separately, not stored in this repository. This account is for development and testing, not real member onboarding.

## Cloudflare environment

Create a separate D1 database for each environment and update its binding in Wrangler configuration. Apply migrations using `--remote` only after verifying the target account and database. Set `BETTER_AUTH_SECRET` as a Cloudflare Worker secret and configure `BETTER_AUTH_URL` to the deployed HTTPS origin; use a newly generated secret that differs from local development. Do not commit `.dev.vars`, production credentials, or real member data. Provision accounts only through a controlled operator process; do not enable public sign-up. Deployment and Workers configuration must be verified before real-member use.

## Checks

Run `npm test` and `npm run typecheck`. Use an isolated local D1 database for browser tests. Financial records created during tests must not be entered into the remote development database.

To run the cross-origin integration test, start an isolated development server and run `RNIG_CSRF_TEST_ORIGIN=http://localhost:3000 node --experimental-strip-types --test tests/security/csrf.integration.test.ts`.

To check the server-rendered login form before client hydration, run `RNIG_AUTH_TEST_ORIGIN=http://localhost:3000 node --experimental-strip-types --test tests/security/login-render.integration.test.ts` against an isolated local server.

To check the real authentication endpoints, start an isolated local server with a test-only, unverified email/password account. Set `RNIG_AUTH_TEST_ORIGIN=http://localhost:3000`, `RNIG_AUTH_TEST_EMAIL`, and `RNIG_AUTH_TEST_PASSWORD`, then run `node --experimental-strip-types --test tests/security/auth.integration.test.ts`. The check signs in and signs out that account and attempts public registration; never point it at a live environment.

With the same environment variables, run `node --experimental-strip-types --test tests/security/invitation.integration.test.ts` to create a synthetic member, issue and claim an invitation, verify the linked account signs in, and check that the invitation cannot be reused. This leaves synthetic records in the local database, so use disposable D1 state. Run authentication checks separately and allow the sign-in rate-limit window to expire between runs; running them concurrently can return HTTP 429.

Invitation claims write the Better Auth user and credential schema in one D1 batch with the member link. Keep this integration and its Workers sign-in test under review when upgrading Better Auth. Invitation links are bearer secrets and should be delivered privately.
