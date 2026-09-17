# LOOP

LOOP is a multi-tenant customer-feedback intelligence application. It centralizes feedback, classifies it with Gemini, exposes searchable workspace insights, and supports grounded questions and Voice-of-Customer reports.

> Documentation status: this README is based on the current repository, its tests, configuration, migrations, and available Git history. No credentials or secret values are included.

## Contents

- [Overview](#overview)
- [Features](#features)
- [Access and permissions](#access-and-permissions)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Technology stack](#technology-stack)
- [Environment variables](#environment-variables)
- [Credential setup](#credential-setup)
- [Local development](#local-development)
- [Database](#database)
- [Authentication and authorization](#authentication-and-authorization)
- [Ingestion](#ingestion)
- [AI and retrieval](#ai-and-retrieval)
- [Testing](#testing)
- [Verification](#verification)
- [API routes](#api-routes)
- [Security](#security)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Evaluation walkthrough](#evaluation-walkthrough)
- [Known limitations](#known-limitations)
- [Future improvements](#future-improvements)

## Overview

LOOP is intended for product, support, and customer-insight teams that need to turn varied customer signals into reviewable product decisions. Authenticated users work inside a workspace. Feedback can be entered manually, imported from CSV, or generated through the simulated support-ticket action in Inbox. Each record is stored in PostgreSQL, classified, associated with themes, and embedded for retrieval.

The application is a Next.js App Router application with server-side route handlers. Authentication uses Auth.js credentials and database-backed users. Authorization uses the `ADMIN`, `ANALYST`, and `VIEWER` roles. Tenant scope is derived from the authenticated session and applied to database reads and writes; client-provided workspace IDs are not trusted.

## Features

- **Authentication:** signup creates a workspace and its first administrator; login uses email/password credentials and Auth.js sessions. Login input is validated and repeated failures are rate-limited in the application process.
- **Workspaces and tenancy:** every user belongs to a workspace, and feedback, themes, reports, and member reads are workspace-scoped.
- **RBAC:** administrators manage members and can delete feedback; administrators and analysts can create/import/reclassify/update feedback and generate reports; all authenticated roles can read the main insight views and ask questions.
- **Manual feedback:** Inbox submits validated content and a supported channel to `POST /api/feedback`. Optional customer labels and source references are supported.
- **CSV ingestion:** Inbox uploads CSV files to `POST /api/feedback/import`. Required headers are `content`, `channel`, and `created_at`; `customer_label` is optional. Files are limited to 5 MB and 500 rows, validated before persistence, and processed through the canonical pipeline.
- **Simulated channel:** Inbox can create four realistic simulated support tickets. Each uses the canonical feedback endpoint and the `SUPPORT_TICKET` channel; this is a local simulation, not an external integration.
- **Inbox:** workspace feedback supports search, channel, sentiment, status, theme, UTC date-range, sort, and page filters. Results are paginated at up to 50 records per page by the API; the UI requests 20 per page.
- **Status workflow:** valid forward transitions are `NEW → REVIEWED → ACTIONED`. Rejected transitions do not change the record.
- **Dashboard:** date-range KPIs show total feedback, negative percentage, new-this-week count, volume, sentiment, and top themes. Loading, empty, and error states are rendered by the UI.
- **Trends:** current and previous-period theme volume, delta, percentage change, and spike indication are shown. A theme link opens Inbox with a workspace-scoped theme filter.
- **Ask LOOP:** questions are embedded, compared against workspace feedback embeddings, and sent to Gemini with retrieved context. Returned source IDs are checked against retrieved records; unsupported answers are explicitly rejected.
- **Voice-of-Customer reports:** administrators and analysts can generate AI narratives from computed workspace facts, save them in PostgreSQL, list them, open them in the UI, and use stable `/reports/[id]` paths.
- **Validation and error handling:** Zod validates authentication, feedback, CSV, filters, AI requests, roles, and report periods. Route handlers map authentication, AI-provider, and database availability errors to safe HTTP responses.
- **Responsive/accessibility work:** pages use responsive Tailwind layouts, labeled form controls, named navigation regions, visible focus styling on key controls, and `status`/`alert` semantics in implemented loading and error states. A complete browser accessibility audit is not verifiable from repository files alone.

## Access and permissions

| Role | Access | Restrictions |
|---|---|---|
| `ADMIN` | All authenticated reads; member management; feedback create/update/delete/reclassify; CSV and simulated ingestion; report generation | Cannot demote the last administrator or demote themselves from `ADMIN` |
| `ANALYST` | All authenticated reads; feedback create/update/reclassify; CSV and simulated ingestion; report generation | Cannot delete feedback or manage workspace members |
| `VIEWER` | Authenticated dashboard, Inbox, Trends, Ask LOOP, and saved-report reads | Cannot ingest, modify, delete, reclassify feedback, generate reports, or manage members |

Signup always creates an `ADMIN` for a newly created workspace. The repository does not implement invitations, password reset, or multiple-workspace membership flows.

## Architecture

```mermaid
flowchart LR
    UI[Next.js pages] --> Routes[Next.js route handlers]
    Routes --> Auth[Auth.js session and RBAC guards]
    Auth --> Services[Typed domain services]
    Services --> DB[(PostgreSQL via Prisma)]
    Services --> Classifier[Gemini classification]
    Services --> Embed[Gemini embeddings]
    Embed --> Retrieval[Workspace-scoped cosine retrieval]
    Retrieval --> Ask[Grounded Ask LOOP response]
    DB --> Views[Inbox, dashboard, trends, reports]
```

For feedback creation, the route validates the request, derives `workspaceId` from the session, persists the record, and calls `processFeedback`. Classification updates sentiment, feature area, rationale, and theme associations; embedding generation stores a vector. CSV imports validate the complete file, persist rows atomically, and process created records sequentially.

## Project structure

```text
.
├── app/
│   ├── page.tsx                         Dashboard UI
│   ├── dashboard/page.tsx               Redirect to dashboard
│   ├── (auth)/login/page.tsx            Login UI
│   ├── (auth)/signup/page.tsx            Signup UI
│   ├── (app)/inbox/page.tsx              Feedback, filters, ingestion, status UI
│   ├── (app)/trends/page.tsx             Theme trends and drill-down
│   ├── (app)/ask/page.tsx                Grounded question UI
│   ├── (app)/reports/page.tsx            Report generation and saved reports
│   ├── (app)/reports/[id]/page.tsx       Saved report detail
│   ├── (app)/settings/page.tsx           Workspace member management
│   └── api/                              Authenticated route handlers
├── components/logout-button.tsx          Shared logout control
├── lib/
│   ├── ai/                               Gemini, prompts, schemas, retrieval, reports
│   ├── analytics/                        Dashboard/trend calculations and theme links
│   ├── auth/                             Auth.js, guards, signup, login policy
│   ├── feedback/                         Persistence, CSV orchestration, simulation
│   ├── security/                         In-process rate limiting
│   └── validation/                       Zod request and CSV schemas
├── prisma/
│   ├── schema.prisma                     PostgreSQL data model
│   ├── migrations/                       Committed migrations
│   └── seed.ts                           Demo workspace and feedback seed
├── tests/                                Node test-runner unit/route/security tests
├── middleware.ts                         Protected application-route matcher
├── next.config.mjs                       Next.js configuration (defaults)
├── package.json                          Scripts and dependencies
└── .env.example                          Safe environment-variable template
```

Generated directories such as `.next/` and `node_modules/` are intentionally omitted.

## Technology stack

| Technology | Purpose |
|---|---|
| Next.js 14.2.30 | App Router UI and server route handlers |
| React 18 | Client-side page interaction |
| TypeScript 5 | Static typing |
| Tailwind CSS 3.4 | Styling and responsive layouts |
| PostgreSQL | Persistent relational database |
| Prisma 5.22.0 | ORM, schema, migrations, and client |
| Auth.js 4.24.15 | Credentials authentication and sessions |
| Google Gemini via `@google/genai` 2.22.0 | Classification, answers, reports, and embeddings |
| Zod 4.6.5 | Runtime validation |
| Recharts 3.10.1 | Dashboard charts |
| Node built-in test runner + `tsx` | Automated tests |
| Vercel + hosted PostgreSQL | Deployment architecture described by the repository |

## Environment variables

The authoritative local template is `.env.example`. Values below are safe placeholders only.

| Variable | Required | Purpose | Local example | Production guidance | Sensitive |
|---|---|---|---|---|---|
| `DATABASE_URL` | Yes | Prisma runtime database connection | `postgresql://user:password@host:5432/loop` | Use the hosted PostgreSQL runtime/pooler connection | Yes |
| `DIRECT_URL` | Yes for Prisma CLI/migrations | Prisma direct migration/admin connection | `postgresql://user:password@host:5432/loop` | Use the provider’s direct/session connection | Yes |
| `NEXTAUTH_SECRET` | Yes | Signs Auth.js session tokens | `<generated-secret>` | Generate a strong unique value | Yes |
| `NEXTAUTH_URL` | Yes | Canonical application URL used by Auth.js | `http://localhost:3000` | Exact public HTTPS deployment origin | No |
| `GEMINI_API_KEY` | Required for AI processing | Server-side Gemini authentication | `<your-gemini-key>` | Store only as a server-side deployment variable | Yes |
| `GEMINI_MODEL` | Optional in code; recommended | Gemini model used by the provider | `gemini-3.6-flash` | Set explicitly to the approved available model | No |
| `ALLOW_DEMO_SEED` | Optional | Explicit production guard for demo seeding | `false` | Keep disabled/unset unless intentionally seeding a demo database | No |

`TEST_DATABASE_URL` is used only by `npm run test:tenant` and is not a production runtime variable. It must point to a disposable PostgreSQL database when running the real tenant integration test.

Never commit `.env`, `.env.local`, credentials, API keys, tokens, or connection strings. The repository ignores local environment files and `.vercel/` metadata.

## Credential setup

### Database / hosted PostgreSQL

Create or select a hosted PostgreSQL database. Copy its runtime/pooler connection into `DATABASE_URL` and its direct/session connection into `DIRECT_URL`; do not manually publish or alter credentials. Apply committed migrations with:

```bash
npx prisma migrate deploy
```

Validate the schema with:

```bash
npx prisma validate
```

The repository does not contain provider-specific Supabase configuration; it requires PostgreSQL-compatible URLs.

### Auth.js

Generate a strong secret using an installed runtime or password generator, for example:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set `NEXTAUTH_URL` to the local origin during development and the exact public HTTPS origin in production. Keep `NEXTAUTH_SECRET` private.

### Gemini

Create a Gemini API key through the Google AI/Gemini service, place it in `GEMINI_API_KEY`, and keep it server-side. Set `GEMINI_MODEL` to the model enabled for the project. The provider is called only by server code; verify it through an authenticated classification, Ask LOOP, or report flow without printing the key.

### Vercel

Add the production variables in the Vercel project’s Environment Variables settings. Configure Preview separately if preview deployments need database and AI access. Redeploy after changing variables; values are not read from committed `.env` files.

## Local development

Prerequisites: Node.js 20+, npm, and a reachable PostgreSQL database.

```bash
npm install
```

Create `.env` from `.env.example` and set the required values. Then apply development migrations:

```bash
npx prisma migrate dev --name foundation
```

Seed the demo workspace when appropriate:

```bash
npm run db:seed
```

Start the application:

```bash
npm run dev
```

Open `http://localhost:3000`. The seed creates one workspace, three demo users, seven themes, and 120 feedback records. Demo credentials are defined by the seed process; retrieve them locally without publishing them, and change or replace them for any non-disposable environment.

Available scripts:

```bash
npm run dev
npm run build
npm start
npm run lint
npm run typecheck
npm run db:generate
npm run db:validate
npm run db:migrate
npm run db:seed
npm test
npm run test:tenant
```

## Database

The PostgreSQL schema contains:

- `Workspace`: tenant boundary.
- `User`: workspace member, role, password hash, and session identity.
- `Feedback`: content, channel, customer label, timestamps, sentiment, status, feature area, and workspace.
- `Theme`: workspace-owned normalized theme.
- `FeedbackTheme`: explicit workspace-aware feedback/theme association with confidence.
- `Embedding`: one vector per feedback record.
- `Report`: persisted workspace report narrative and author.

Foreign keys, composite workspace-aware relations, unique constraints, and indexes support tenant integrity and common Inbox queries. The committed migrations are:

1. `20260916190022_foundation`
2. `20260916192303_tenant_relation_integrity`
3. `20260917100000_status_transition_model`

Use `prisma migrate dev` for local schema development and `prisma migrate deploy` for an already-created deployment database. Do not use `migrate dev` against production.

## Authentication and authorization

Signup validates name, email, password, and workspace name, hashes the password with `bcryptjs`, and creates the initial administrator with a nested workspace. Login validates credentials, looks up the user through Prisma, compares the hash, and establishes an Auth.js JWT session containing user identity, role, and workspace context.

`requireSession` verifies the session and refreshes role/workspace data from the database. `requireRole` enforces server-side role boundaries. `middleware.ts` protects `/`, `/dashboard`, `/inbox`, `/trends`, `/ask`, `/reports`, and `/settings`; route handlers independently authenticate and authorize API requests.

Workspace IDs are taken from the authenticated session. Feedback, themes, reports, dashboard calculations, retrieval, and member queries include workspace scope. Cross-workspace feedback and report access therefore return no record through the relevant service/route paths.

## Ingestion

```mermaid
flowchart LR
    Manual[Manual form]
    CSV[CSV upload]
    Sim[Simulated support tickets]
    Manual --> Canonical[POST /api/feedback]
    Sim --> Canonical
    CSV --> Validate[Whole-file validation]
    Validate --> Batch[Atomic batch persistence]
    Batch --> Process[Classification + embedding]
    Canonical --> Process
    Process --> Store[(Workspace-scoped Feedback)]
    Store --> Views[Inbox, dashboard, trends, reports, retrieval]
```

Manual and simulated records use the canonical `POST /api/feedback` path. CSV accepts only the documented headers, normalizes supported channels, validates ISO dates and labels, rejects invalid files without partial rows, then calls the same persistence/processing services. Duplicate CSV rows do not have a deduplication identity and are preserved as separate records.

Supported channels are `SUPPORT_TICKET`, `APP_STORE`, `NPS_SURVEY`, `SALES_CALL`, and `COMMUNITY`. The simulated source uses `SUPPORT_TICKET` fixtures and does not call an external service.

## AI and retrieval

`lib/ai/provider.ts` defines the provider abstraction and its Gemini implementation. The provider sends JSON-mode requests with a system instruction, deterministic temperature, bounded retry behavior, and Zod validation. `lib/ai/classifier.ts` classifies sentiment and feature area, creates/reuses themes, and writes feedback-theme associations. `lib/ai/embeddings.ts` uses Gemini’s `gemini-embedding-001` model and stores vectors in `Embedding`.

Ask LOOP embeds the question, retrieves up to five highest-similarity records from the authenticated workspace, sends only that context to Gemini, and filters returned source IDs through `enforceGrounding`. It returns an insufficient-evidence response when no valid grounded sources remain. This is application-level cosine retrieval over stored JSON vectors, not a database vector extension.

Reports compute workspace facts and comparison-period statistics first, then ask Gemini for a schema-validated narrative. Quote source IDs are filtered to the computed representative evidence before persistence. AI provider failures and malformed structured output are mapped to typed provider errors and safe route responses; live provider availability is external to the repository.

## Testing

The project uses Node’s built-in test runner with `tsx` and module mocks. `npm test` loads `.env` through `dotenv/config` and runs `tests/**/*.test.ts`. `npm run test:tenant` runs the real Prisma tenant test and requires `TEST_DATABASE_URL`.

### Test-case report

The following are the test cases present in the repository. The execution recorded during this README update was **57 passed, 0 failed, 0 skipped** for `npm test`; the real Prisma tenant test is separately available through `npm run test:tenant` and requires a disposable database.

| ID | Test case | Area | Expected result | Status | Evidence |
|---|---|---|---|---|---|
| AI-01 | Reject incomplete classification output | AI validation | Zod rejects invalid output | PASS | `tests/ai-security.test.ts` |
| AI-02 | Remove citations outside retrieved feedback | Grounding | Unknown IDs are removed | PASS | `tests/ai-security.test.ts` |
| AI-03 | Reject answers with no grounded sources | Grounding | Safe insufficient-evidence answer | PASS | `tests/ai-security.test.ts` |
| AI-04 | Deterministic cosine similarity | Embeddings | Known vectors produce expected scores | PASS | `tests/ai-security.test.ts` |
| AI-05 | Surface missing embedding provider | AI failure | No fabricated answer | PASS | `tests/ai-security.test.ts` |
| AI-06 | Retry transient provider failure | Gemini | Bounded retry succeeds | PASS | `tests/ai-security.test.ts` |
| AI-07 | Reject malformed model JSON | Gemini parsing | Retry then reject | PASS | `tests/ai-security.test.ts` |
| AI-08 | Map Gemini 503 | Gemini errors | Typed bounded 503 error | PASS | `tests/ai-security.test.ts` |
| AI-09 | Map truncated JSON | Gemini parsing | Safe 502 invalid-response error | PASS | `tests/ai-security.test.ts` |
| AI-10 | Strip markdown JSON fences | Parsing | Fenced JSON parses | PASS | `tests/ai-security.test.ts` |
| AUTH-01 | Reject invalid login input | Auth validation | Missing/malformed credentials fail | PASS | `tests/auth.test.ts` |
| AUTH-02 | Limit failed logins and reset | Login protection | Five failures rate-limit; reset clears | PASS | `tests/auth.test.ts` |
| AUTH-03 | Protect root route | Middleware | Root is matched | PASS | `tests/auth.test.ts` |
| CSV-01 | Reject unauthenticated CSV upload | API auth | 401 before file read | PASS | `tests/csv-route.test.ts` |
| CSV-02 | Enforce feedback write roles | RBAC | Admin/analyst write; viewer cannot | PASS | `tests/csv-route.test.ts` |
| CSV-03 | Use canonical scoped pipeline | CSV ingestion | Session workspace and processing used | PASS | `tests/csv-route.test.ts` |
| CSV-04 | Parse quoted comma content | CSV parsing | Quoted fields preserved | PASS | `tests/csv.test.ts` |
| CSV-05 | Parse escaped quotes/CRLF | CSV parsing | Valid CSV parses | PASS | `tests/csv.test.ts` |
| CSV-06 | Reject missing/empty/header-only files | CSV validation | Descriptive errors | PASS | `tests/csv.test.ts` |
| CSV-07 | Reject workspace/security columns | Tenant security | Client cannot supply workspace scope | PASS | `tests/csv.test.ts` |
| CSV-08 | Reject invalid rows without partial records | CSV validation | No returned rows | PASS | `tests/csv.test.ts` |
| CSV-09 | Validate dates and optional labels | CSV validation | Valid dates/labels accepted | PASS | `tests/csv.test.ts` |
| CSV-10 | Enforce customer-label limit | Validation | 160-character limit enforced | PASS | `tests/csv.test.ts` |
| CSV-11 | Enforce row limit | CSV validation | More than 500 rows rejected | PASS | `tests/csv.test.ts` |
| DASH-01 | Validate dashboard ranges | Dashboard | Invalid/reversed dates fail | PASS | `tests/dashboard.test.ts` |
| DASH-02 | Aggregate volume/sentiment/themes | Dashboard | Expected metrics calculated | PASS | `tests/dashboard.test.ts` |
| DASH-03 | Apply dashboard workspace scope | Tenancy | Only workspace records counted | PASS | `tests/dashboard.test.ts` |
| DASH-04 | Calculate UTC week/empty state | Dashboard | Correct week and null negative metric | PASS | `tests/dashboard.test.ts` |
| ERR-01 | Do not map provider errors to auth | Error handling | Provider response is not authorization | PASS | `tests/error-handling.test.ts` |
| ERR-02 | Map database outage safely | Error handling | Service-unavailable response | PASS | `tests/error-handling.test.ts` |
| FB-01 | Accept all supported manual channels | Feedback | Valid payload without workspace field | PASS | `tests/feedback-entry.test.ts` |
| FB-02 | Require trimmed content and channel | Feedback validation | Invalid payload rejected | PASS | `tests/feedback-entry.test.ts` |
| INBOX-01 | Validate Inbox filters | Inbox | Invalid dates/ranges rejected | PASS | `tests/inbox-filters.test.ts` |
| INBOX-02 | Combine filters, tenant theme, sort, pagination | Inbox | Both data/count queries are scoped | PASS | `tests/inbox-filters.test.ts` |
| INBOX-03 | Include entire same-day range | Inbox dates | End date is inclusive | PASS | `tests/inbox-filters.test.ts` |
| ROUTE-01 | Reject unauthenticated protected reads | API auth | 401 response | PASS | `tests/route-auth.test.ts` |
| ROUTE-02 | Reject unauthenticated writes | API auth | 401 before mutation | PASS | `tests/route-auth.test.ts` |
| ROUTE-03 | Enforce route role boundaries | RBAC | Unauthorized roles receive 403 | PASS | `tests/route-auth.test.ts` |
| SEED-01 | Process all seeded feedback | Seed pipeline | Every record classified/embedded | PASS | `tests/seed-processing.test.ts` |
| SEED-02 | Report seed processing failures | Seed pipeline | Failures are not hidden | PASS | `tests/seed-processing.test.ts` |
| REPORT-01 | Generate stable report paths | Reports | `/reports/[id]` is deterministic | PASS | `tests/report-shareability.test.ts` |
| SIM-01 | Validate simulated support fixtures | Simulation | Supported channel and valid payload | PASS | `tests/simulated-channel.test.ts` |
| STATUS-01 | Allow only forward transitions | Workflow | Only two transitions allowed | PASS | `tests/status-transitions.test.ts` |
| STATUS-02 | Persist valid/reject invalid transitions | Workflow | Valid changes persist; invalid do not | PASS | `tests/status-transitions.test.ts` |
| STATUS-03 | Reject cross-workspace transitions | Tenancy | Other workspace remains unchanged | PASS | `tests/status-transitions.test.ts` |
| STATUS-04 | Reject unsupported statuses | Validation | Non-spec values fail | PASS | `tests/status-transitions.test.ts` |
| STATUS-05 | Never downgrade actioned feedback | Classification | `ACTIONED` status preserved | PASS | `tests/status-transitions.test.ts` |
| TENANT-01 | Read feedback by workspace | Tenant isolation | Workspace A cannot read B | PASS | `tests/tenant-isolation.test.ts` |
| TENANT-02 | Update feedback by workspace | Tenant isolation | Workspace A cannot update B | PASS | `tests/tenant-isolation.test.ts` |
| TENANT-03 | Delete feedback by workspace | Tenant isolation | Workspace A cannot delete B | PASS | `tests/tenant-isolation.test.ts` |
| TENANT-04 | Enforce three workspace roles | RBAC | Write permissions follow role | PASS | `tests/tenant-isolation.test.ts` |
| TENANT-05 | Prevent client workspace override | Tenant security | Session workspace wins | PASS | `tests/tenant-isolation.test.ts` |
| THEME-01 | Drill down from theme | Trends/Inbox | Link opens Inbox with `themeId` | PASS | `tests/theme-drilldown.test.ts` |
| WORKSPACE-01 | Create admin with workspace | Signup | Nested workspace and hash created | PASS | `tests/workspace.test.ts` |
| WORKSPACE-02 | Validate workspace signup input | Signup | Invalid input rejected | PASS | `tests/workspace.test.ts` |
| WORKSPACE-03 | Preserve admin safeguards | RBAC | Last-admin/self-demotion protections hold | PASS | `tests/workspace.test.ts` |
| PRISMA-01 | Real Prisma tenant isolation | Integration | Independent workspaces cannot cross-read | Implemented; execution requires `TEST_DATABASE_URL` | `tests/prisma-tenant.integration.test.ts` |

### Verification commands

```bash
npm test
npm run test:tenant
npm run typecheck
npm run lint
npm run build
npx prisma validate
```

## Verification

### Automated verification

Verified during this README update:

- `npm test`: 57 passed, 0 failed, 0 skipped.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npx prisma validate`: passed.

`npm run typecheck` is defined and should be run after a clean build; a prior concurrent check can race with Next.js-generated `.next/types`. Its result should be recorded from a standalone run, not inferred from the build.

The repository contains automated coverage for route authorization, validation, tenant behavior, ingestion, status transitions, AI parsing/error mapping, dashboards, and theme drill-down. Browser/E2E tests are not present.

### Manual verification

The repository does not provide an auditable browser session or deployed URL. Therefore the following are **not verified by repository inspection alone**: production deployment, browser rendering at desktop/tablet/mobile sizes, keyboard-only traversal, real hosted-PostgreSQL connectivity, live Gemini availability, and end-to-end role walkthroughs. Use the [Evaluation walkthrough](#evaluation-walkthrough) after configuring a real environment.

## API routes

| Method | Route | Purpose | Authentication | Authorization |
|---|---|---|---|---|
| `GET` | `/api/analytics/dashboard` | Workspace KPIs and chart data | Required | Any authenticated role |
| `POST` | `/api/ask` | Grounded workspace question | Required | Any authenticated role |
| `GET`, `POST` | `/api/auth/[...nextauth]` | Auth.js handlers | Auth.js | Auth.js |
| `POST` | `/api/auth/signup` | Create workspace administrator | Public | Input validation |
| `GET`, `POST` | `/api/feedback` | List/create feedback | GET required; POST required | POST: `ADMIN`, `ANALYST` |
| `GET`, `PATCH`, `DELETE` | `/api/feedback/[id]` | Read/update/delete feedback | Required | PATCH: admin/analyst; DELETE: admin |
| `POST` | `/api/feedback/[id]/reclassify` | Re-run processing | Required | `ADMIN`, `ANALYST` |
| `POST` | `/api/feedback/import` | Validate/import CSV | Required | `ADMIN`, `ANALYST` |
| `GET`, `POST` | `/api/reports` | List/generate reports | Required | POST: `ADMIN`, `ANALYST` |
| `GET` | `/api/reports/[id]` | Read saved report | Required | Workspace-scoped |
| `GET` | `/api/themes` | List workspace themes | Required | Any authenticated role |
| `GET` | `/api/themes/[id]/feedback` | Workspace-scoped theme feedback JSON | Required | Workspace-scoped |
| `GET` | `/api/trends` | Workspace trend metrics | Required | Any authenticated role |
| `GET` | `/api/workspace/members` | List members | Required | `ADMIN` |
| `PATCH` | `/api/workspace/members/[id]` | Change member role | Required | `ADMIN` plus policy safeguards |

## Security

Verified security controls include Auth.js authentication, bcrypt password hashing, server-side Zod validation, role guards, protected route middleware, workspace-derived authorization, composite workspace-aware Prisma relations, tenant-scoped queries, protected provider secrets, bounded login failure tracking, grounded source-ID filtering, and safe error mapping.

These controls do not replace production operations. Before deployment:

- keep all environment files and credentials out of Git;
- use strong unique production secrets;
- restrict Gemini API-key usage and monitor quota;
- use HTTPS and the correct `NEXTAUTH_URL`;
- apply migrations before serving the new application version;
- verify tenant isolation with a disposable database;
- avoid enabling demo seeding on a real production dataset;
- review logs for accidental secret or customer-data exposure.

## Deployment

The repository has no `vercel.json` and no CI workflow. Vercel’s Next.js auto-detection is therefore the intended deployment path.

1. Create a hosted PostgreSQL database and obtain runtime and direct connection strings.
2. Import the repository into Vercel.
3. Use the repository root, Node.js 20.x, `npm ci`, and `npm run build`; leave the output directory at its automatic Next.js default.
4. Add `DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GEMINI_API_KEY`, and, preferably, `GEMINI_MODEL` to the Vercel Production environment.
5. Apply migrations from a trusted environment:

   ```bash
   npx prisma migrate deploy
   ```

6. Seed only an isolated demo database when required, using the existing guarded seed process; do not permanently enable `ALLOW_DEMO_SEED` in production.
7. Deploy from the production branch through Vercel Git integration or the CLI:

   ```bash
   vercel login
   vercel link
   vercel pull --yes --environment=production
   vercel --prod
   ```

8. Verify build logs, startup, login, role boundaries, database reads/writes, tenant isolation, ingestion, reports, and AI flows.
9. Configure Preview variables separately if preview deployments need real services. Update `NEXTAUTH_URL` and redeploy after assigning a custom domain.

## Troubleshooting

| Symptom | Likely cause | Safe response |
|---|---|---|
| Prisma cannot connect | Missing, malformed, or unreachable database URL | Check variable names and provider-issued PostgreSQL URLs; validate network/provider status without printing them |
| Migration fails | Wrong direct URL or unapplied migration state | Use `npx prisma migrate deploy` with the direct migration connection and inspect Prisma’s non-secret error |
| Login redirects or fails | Wrong `NEXTAUTH_URL`, missing secret, or unavailable database | Set the exact origin, configure `NEXTAUTH_SECRET`, and check database availability |
| AI reports unavailable | Missing key, invalid model, quota, or Gemini outage | Check server-side variables/provider status; preserve the safe error response and retry later |
| AI response rejected | Malformed or truncated structured output | Provider retries once and returns a typed safe error; do not bypass schema validation |
| Build fails on Vercel | Dependency, environment, or Node-version mismatch | Reproduce with `npm ci && npm run build`, inspect build logs, and configure required variables |
| Demo data is absent | Seed was not run or was blocked by production guard | Seed the intended disposable/demo database through the guarded command |

## Evaluation walkthrough

1. Configure `.env` and start with `npm run dev`.
2. Create a workspace through `/signup` or seed the documented demo workspace.
3. Log in as each role and verify the visible/API permission boundaries.
4. Add manual feedback, import a valid CSV, and use the simulated support-ticket action.
5. In Inbox, verify search, channel, sentiment, status, theme, date, sorting, pagination, and forward status transitions.
6. Review Dashboard KPIs/charts and Trends; open a theme drill-down into filtered Inbox.
7. Ask a question with supporting feedback and an unsupported question; confirm source records and insufficient-evidence behavior.
8. Generate, save, reopen, and directly open a report.
9. Use two workspaces in a disposable database and verify that records do not cross tenant boundaries.
10. Exercise loading, empty, error, responsive, and keyboard states in a browser. These last checks require a running application and are not represented by the Node test suite.

## Known limitations

- The support-channel integration is intentionally simulated with local fixtures; no external support provider is connected.
- Gemini, PostgreSQL, and Auth.js operation depend on correctly configured external services and production environment variables.
- Retrieval is an application-level cosine scan over up to 5,000 workspace feedback records and JSON vectors; it is not a database vector index.
- Login failure rate limiting is in-process memory and is not a distributed rate limiter.
- No browser/E2E test framework is included, so production browser behavior and complete accessibility cannot be proven by `npm test`.
- The repository’s only visible Git commit is the initial Create Next App commit; a reliable chronological development history is therefore not available from Git history.
- Password reset, invitations, external integrations, background processing, and multi-workspace membership are not implemented in the repository.

## Future improvements

Possible future work includes distributed rate limiting, asynchronous processing for large imports, database-native vector search, external channel adapters, browser/E2E coverage, and invitation/password-reset workflows. These are not current features.

## Repository standards

- Keep secrets in local/deployment environment stores, never in source or README files.
- Validate new route inputs and authorize on the server.
- Preserve workspace scope in every tenant-owned query and mutation.
- Use Prisma migrations for schema changes; apply committed migrations to deployment databases before release.
- Run tests, typecheck, lint, build, and Prisma validation before submission.
- Keep simulated data and demo seeding isolated from real production data.

## Documentation audit

- Environment variable names were checked against `.env.example` and code references; secret values were intentionally omitted.
- Features and permissions were checked against routes, services, UI pages, Prisma schema, and tests.
- Test names and the 57-test execution result were recorded without inventing browser results.
- The only available Git history is the initial commit, so detailed phase-by-phase development history could not be verified.
