# Austin Education · Teacher Workspace

A focused full-stack reference solution for the take-home assignment. It implements one complete vertical slice:

> teacher sign-in → today’s assigned classes → roster and new-student context → attendance → immutable lesson-credit entries → editable structured family-update draft.

The product and domain decisions are in [DESIGN.md](./DESIGN.md). A suggested interviewer rubric and destructive-test guide are in [INTERVIEWER_NOTES.md](./INTERVIEWER_NOTES.md).

## What is implemented

- React 19 + TypeScript teacher workspace, responsive from mobile to desktop.
- Server-rendered ChatGPT sign-in gate; local development provides a simulated staff account.
- Cloudflare D1 / SQLite with Drizzle schema and five checked-in migrations.
- 30 synthetic students, two teachers, one admin, guardians, three visible classes and a second teacher’s protected class.
- Object-level authorisation: a teacher cannot read or complete another teacher’s session.
- Whole-roster submission with server validation and an idempotency key.
- Attendance and credit ledger entries written in one D1 batch transaction.
- An immutable ledger with database uniqueness and protection triggers.
- Zero-credit policy: save the attendance fact, create no negative ledger entry, and mark it for admin review.
- Structured LLM feedback with JSON Schema + Zod validation, PII reduction, an 8-second timeout and a deterministic no-key/failure fallback.
- Loading, empty, error, conflict, fallback, completion and insufficient-credit states.
- A small WebMCP tool (`complete_current_class`) that uses the same server action as the visible UI when the browser supports the proposed API.

## Run locally

Requirements: Node.js 22.13+ and npm.

### 1. Install and build

```bash
npm run install:ci
npm run build
```

The first build creates `dist/server/wrangler.json` with the local D1 binding.

### 2. Apply the local migrations once, in order

```bash
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_opposite_hulk.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_dark_mongu.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_fuzzy_wild_pack.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0003_attendance-guards.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0004_optimize-indexes.sql
```

### 3. Start the app

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173), choose **Sign in with ChatGPT**, and the local Sites runtime signs in `seedy@sites.test` as teacher Mei Lin.

The first authenticated workspace request runs the idempotent seed routine in [lib/demo-data.ts](./lib/demo-data.ts). To run it explicitly while the development server is active:

```bash
npm run db:seed
```

All names, contacts and records are synthetic.

## Optional live AI mode

The attendance workflow never requires an AI provider. Without configuration, “Draft family update” returns a validated local fallback and labels it clearly.

To exercise the live provider path, copy `.env.example` to `.env.local` and supply:

```dotenv
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5-mini
```

The key is used only by the server-side route and must never be committed. Hosted runtime values should be configured in the hosting control plane.

## Validation

```bash
npm test
npm run build
```

The implemented API surface is:

- `GET /api/workspace?sessionId=...` — the signed-in teacher’s Melbourne-day sessions and one roster.
- `POST /api/sessions/:sessionId/complete` — whole-roster finalisation; requires `Idempotency-Key`.
- `POST /api/feedback/draft` — structured AI or deterministic fallback draft.

Useful destructive checks:

1. POST the protected session `session_other_teacher_<today>` as Mei Lin; the API returns `403 SESSION_ACCESS_DENIED`.
2. Replay the exact same completion with the same idempotency key; it returns the original result and does not charge again.
3. Reuse that key with changed attendance; it returns `409 IDEMPOTENCY_KEY_REUSED`.
4. Submit a non-roster student or omit a roster student; it returns 422 without partial writes.
5. Leave `OPENAI_API_KEY` empty; feedback still returns a valid editable structure and attendance remains independent.

## Architecture

```text
React client workspace
  → authenticated route handlers
  → domain services (authorisation, state, idempotency, billing policy)
  → prepared D1 statements and transactional batch
  → database CHECK / UNIQUE / trigger backstops
```

This is intentionally a modular monolith. The data volume does not justify microservices. Browser state is limited to the open class form; durable state stays in D1.

Notable decisions:

- `ClassSeries` and `LessonSession` are separate so one day can be cancelled or assigned to a substitute without rewriting the weekly class.
- Lesson balance is derived from immutable `CreditTransaction` rows.
- The server derives the actor from the authenticated request; it never accepts a role or teacher ID from the browser.
- The class-completion hash is computed from a canonical payload. A matching retry is safe; a changed payload under the same key is rejected.
- AI is outside the attendance transaction and cannot set status, permissions or charges.

## Known boundaries

- The reference UI covers teachers; an admin queue for `pending_insufficient_credit` is designed but not implemented.
- Completed attendance is intentionally read-only for teachers. A production admin correction flow would append reversal entries and audit events.
- The local simulated account is seed-specific. Production membership should be provisioned explicitly rather than auto-claiming staff.
- Session generation is demo-oriented and keeps an active synthetic class available on the current Melbourne date. A production scheduler would materialise instances from recurrence rules.
- WebMCP registration is progressive enhancement; unsupported browsers use the normal UI.

## AI-tool disclosure

Codex was used to analyse the ambiguous brief, compare two viable slices, scaffold the UI, draft migrations, implement APIs and prepare tests/documentation. The implementation did **not** accept several tempting suggestions:

- It does not build the whole lifecycle or generic CRUD pages; the slice stays narrow.
- It does not store a mutable `remainingCredits` field.
- It does not add an AI chat box or let AI decide attendance and charging.
- It does not block recording a real attendance fact when a balance is zero.
- It does not introduce a global state store, microservices or a general workflow engine.

Every generated choice should still be defended in the interview; this README and the design document state those choices explicitly.
