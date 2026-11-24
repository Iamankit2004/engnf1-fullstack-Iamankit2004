# AI Usage Disclosure

## Tools Used
* **Gemini** — used as a development assistant for debugging, SQL optimization, deployment troubleshooting, and documentation drafting.

## How AI Was Used
* **Debugging & TypeScript Fixes:** Resolved Vercel build errors (`TS2307` missing `react-router-dom` dependency and `TS1294` `erasableSyntaxOnly` constructor parameter properties in `frontend/src/api.ts`).
* **Performance Benchmarking & Optimization:** Drafted a temporary Node.js benchmark script to measure `GET /api/tickets?limit=100` latency on 500+ rows, then applied composite indexes in `backend/src/db/schema.sql` and a single-query `COUNT(*) OVER()` refactor in `backend/src/routes/tickets.ts`.
* **Deployment & Docs:** Guided Render (backend) and Vercel (frontend) environment configuration (`VITE_API_URL`, `CORS_ORIGIN`) and helped structure `README.md` and `SOLUTION.md` using verified local benchmark results.

## Verification & Ownership
* Every code change, migration (`npm run db:migrate`), production build (`npm run build`), concurrency test, and latency benchmark was executed and verified locally and against the live Render/Vercel deployments.