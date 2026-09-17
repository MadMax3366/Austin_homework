# Austin Education · Teacher Attendance Vertical Slice

This take-home submission implements one complete workflow:

> teacher sign-in → Melbourne-day class roster → explicit attendance → immutable lesson-credit ledger or billing exception → editable structured feedback → completed read-only result.

The narrow implementation sits inside a broader student-operations design:

- [DESIGN.md](./DESIGN.md) — concise Part A submission.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — roles, lifecycles, modules, data model and evolution.
- [DEMO.md](./DEMO.md) — ten-minute vertical-slice proposal.
- [TESTING.md](./TESTING.md) — adversarial and recovery test plan.

## Implemented

- React 19 + TypeScript responsive teacher workspace.
- Server-rendered sign-in and server-side role/object authorisation.
- Cloudflare D1 / SQLite with reviewed Drizzle migrations.
- Explicit, idempotent local seed with 30 synthetic students and two teachers.
- Frozen `SessionParticipant` snapshots, so later Enrollment changes do not rewrite history.
- Explicit unmarked attendance, “mark all present”, and a consequential final confirmation.
- Database-validated completion claim before Attendance/Ledger/Audit writes.
- Idempotency key + canonical request hash + stable completion receipt.
- Immutable CreditTransaction ledger with account/source and non-negative checks.
- Zero-credit Attendance plus a real `BillingException` queue and admin/manager resolution API.
- Request IDs, body limits, same-origin writes and differentiated business/infrastructure errors.
- Session-scoped draft recovery, dirty guard, request cancellation and unknown-outcome reconciliation.
- AI structured output, Zod validation, name/contact/date reduction, sensitive-note fallback,
  `store:false`, two-level rate limiting and metadata-only audit.
- Loading, empty, unauthorised, cancelled, conflict, fallback and completed states.

## Local setup

Requirements: Node.js 22.13+ and npm.

```bash
npm run install:ci
npm run build
```

Apply the migrations once, in order:

```bash
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_opposite_hulk.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_dark_mongu.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_fuzzy_wild_pack.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0003_attendance-guards.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0004_optimize-indexes.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0005_broken_loners.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0006_harden-completion.sql
```

Seed synthetic local data explicitly, then start the app:

```bash
npm run db:seed
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and choose **Sign in with ChatGPT**.
The local Sites runtime signs in `seedy@sites.test` as teacher Mei Lin.

The normal application routes never create or mutate demo data. The seed command is local-only
and creates:

- one current class owned by Mei;
- a protected class owned by Arjun;
- exactly one new student;
- balances of 14, 8, 3, 1 and 0 credits;
- frozen participant snapshots.

All names and contact details are synthetic.

## Optional live AI

Without a key, “Draft family update” returns a validated local fallback. The attendance workflow
does not depend on the provider.

Copy `.env.example` to `.env.local`:

```dotenv
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5-mini
```

The provider request is server-side, uses `store:false` and receives only reduced class-note text.
Do not commit secrets or real student information.

## API surface

| Method | Route | Authorisation |
|---|---|---|
| GET | `/api/workspace?sessionId=...` | Teacher; own sessions only |
| POST | `/api/sessions/:sessionId/complete` | Teacher; assigned session; Idempotency-Key |
| POST | `/api/feedback/draft` | Teacher; assigned scheduled session |
| GET | `/api/admin/billing-exceptions` | Admin owner or Manager |
| POST | `/api/admin/billing-exceptions/:id/resolve` | Admin owner or Manager; Idempotency-Key |

## Validation

```bash
npm test
npm run lint
npm run build
```

The test suite includes:

- domain schemas, billing policy, fallback and Melbourne business date;
- clean migration replay in in-memory SQLite;
- frozen roster, completion claim, teacher/participant, ledger and enrollment constraints;
- zero-credit exception and immutable-ledger checks.

Manual API checks additionally cover cross-teacher 403, exact replay, changed-payload conflict
and the zero-credit exception result. See [TESTING.md](./TESTING.md) for the full matrix.

## Architecture decisions

- A modular monolith is appropriate for roughly 1,000 students and 60 weekly classes.
- `ClassSeries` is the recurring plan; `LessonSession` is a real occurrence.
- `SessionParticipant` freezes the operational roster for history.
- Attendance is the learning-service fact; CreditTransaction is the financial fact.
- Credit balance is `SUM(immutable ledger)`, not a mutable field.
- A database-triggered claim turns stale-version completion into a transactional SQL failure.
- LLM output is untrusted text and never controls authorisation, attendance or charging.

## Known boundaries

- The implemented UI is teacher-focused; the billing-exception resolution is API/domain complete
  but does not yet have a full Admin console.
- Feedback is one class-level family-update draft, not a per-student report.
- Inquiry/trial CRM, schedule editing, payment processing, messaging and family portal are design-only.
- The committed SQLite tests protect DB invariants; a production rollout should add remote D1
  concurrency/E2E tests, monitoring and backup/restore rehearsal.

## AI-tool disclosure

I used Codex for requirement decomposition, alternative-slice comparison, initial scaffolding,
schema/API/UI drafts, adversarial review, testing and documentation. I reviewed and changed the
generated design rather than accepting it as authoritative.

Examples of rejected or corrected suggestions:

- broad lifecycle CRUD instead of one deep slice;
- mutable `remainingCredits` instead of a ledger;
- AI-controlled attendance or an AI chat box;
- automatic family messaging;
- microservices and a global client store at this scale;
- runtime demo seeding;
- defaulting every unmarked student to Present;
- checking an optimistic lock only after a database batch had committed.
