## Part A: Architecture & Request Lifecycle
TriageSync separates concerns into a stateless Express/TypeScript REST API (`backend/`) and a Vite/React SPA (`frontend/`), backed by Neon PostgreSQL.

1. **Request Flow:** The React client (`frontend/src/api.ts`) attaches the stored JWT via `Authorization: Bearer <token>` and sends requests to `VITE_API_URL`.
2. **Middleware Pipeline:** Express parses JSON, applies CORS against `CORS_ORIGIN`, validates JWTs in `backend/src/middleware/auth.ts` (attaching `req.user` typed via `backend/src/types/express.d.ts`), and routes to modular handlers in `backend/src/routes/`.
3. **Error Handling:** All async routes are wrapped in `asyncHandler` (`backend/src/utils/asyncHandler.ts`) and funnel structured `AppError` instances (`backend/src/errors.ts`) into `backend/src/middleware/errorHandler.ts` so every failure returns `{ "error": { "code": "...", "message": "..." } }`.

## Part B: Concurrency, Idempotency & Data Integrity

### 1. Race-Safe Resource Bookings
Application-level overlap checks suffer from TOCTOU (time-of-check to time-of-use) race conditions under concurrent requests. To enforce mutual exclusion at the database layer, `backend/src/db/schema.sql` uses PostgreSQL's `btree_gist` extension with an exclusion constraint:
* `CONSTRAINT bookings_no_overlap EXCLUDE USING gist ("resourceId" WITH =, tstzrange("startTime", "endTime", '[)') WITH &&) WHERE (status IN ('PENDING','APPROVED'))`
* Half-open intervals (`'[)'`) allow legal back-to-back bookings (e.g., `10:00–11:00` and `11:00–12:00`).
* Concurrent overlapping inserts fail with PostgreSQL error `23P01` (`exclusion_violation`), which the API translates into a clean `409 Conflict` response.

### 2. Idempotent Ticket Imports & Human Override Protection
In `backend/src/routes/tickets.ts` (`POST /api/tickets/import`):
* The full batch is validated before opening a transaction, then sorted by `externalId` to guarantee consistent row-lock ordering and prevent deadlocks during concurrent imports.
* Each row uses `INSERT ... ON CONFLICT ("externalId") DO UPDATE` with conditional `CASE WHEN tickets."isHumanOverride"` expressions so re-importing updates `subject`/`body` without overwriting human-triaged `category`, `autoCategory`, or `priority`.
* `PATCH /api/tickets/:id` acquires a row lock (`SELECT ... FOR UPDATE`), updates `isHumanOverride` / `isReviewed`, and records every field delta in `ticket_events` atomically inside a single transaction.

## Part C: Latency Benchmark & Optimization (`GET /api/tickets?limit=100`)

### Bottleneck Identified
Benchmarking `GET /api/tickets?limit=100` across 10 consecutive runs on 500+ imported tickets against remote Neon PostgreSQL revealed an average latency of **1389.73 ms** (min **1056.60 ms**, max **2592.85 ms**). Two issues caused this:
1. `tickets` had no index on `("createdAt" DESC, id DESC)` or filter columns, forcing full table scans and sorts.
2. `GET /api/tickets` executed **two sequential database round-trips** (`SELECT COUNT(*)` followed by `SELECT ... LIMIT`).

### Fix Applied
1. Added composite indexes in `backend/src/db/schema.sql`:
   * `tickets_created_at_id_desc_idx ON tickets ("createdAt" DESC, id DESC)`
   * `tickets_filters_idx ON tickets (status, category, priority, "createdAt" DESC, id DESC)`
2. Refactored `GET /api/tickets` in `backend/src/routes/tickets.ts` to use a single-query window function (`COUNT(*) OVER()::int AS _total`), cutting one full network round-trip to Neon per request.

### Before vs. After Results (500+ Tickets, 10 Runs)
| Metric | Before | After | Improvement |
| :--- | :--- | :--- | :--- |
| **Average** | `1389.73 ms` | `1024.09 ms` | **-26.3%** |
| **Steady-State Min** | `1056.60 ms` | `550.74 ms` | **-47.9%** |
| **Cold Max** | `2592.85 ms` | `2112.18 ms` | **-18.5%** |

## Part D: Known Limitations & Next Improvements
* `backend/src/routes/tickets.ts` (lines 62–88): `POST /api/tickets/import` currently runs one parameterized `INSERT ... ON CONFLICT` per item inside a transaction. For batches of 1,000–5,000 rows over remote DB links, switching to a batched `UNNEST` multi-row upsert would reduce network round-trips significantly.
* `backend/src/routes/tickets.ts` (line 138): `q` search uses `ILIKE '%...%'`, which cannot leverage B-tree indexes. Adding a `pg_trgm` GIN index on `subject` and `body` would keep search fast at 50k+ tickets.