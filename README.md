# TriageSync

A full-stack support ticket triage and resource booking platform built with Express, TypeScript, PostgreSQL (Neon), and React (Vite).

## Live URLs
* **Frontend:** https://triagesync-web.vercel.app
* **Backend API:** https://triagesync-api.onrender.com

## Seeded Test Accounts
* **Admin:** `admin@triagesync.test` / `Admin@123`

## Features
* **Authentication & RBAC:** JWT-based registration and login with `USER` and `ADMIN` roles.
* **Idempotent Ticket Import & Auto-Triage:** Bulk import up to 5,000 tickets with rule-based category/priority classification while preserving human overrides on re-import.
* **Ticket Management & Audit Trail:** Filterable, paginated ticket list (`status`, `category`, `priority`, full-text search `q`) and transactional `PATCH` updates logged to `ticket_events`.
* **Race-Safe Resource Booking:** PostgreSQL `EXCLUDE USING gist` constraint prevents overlapping active (`PENDING`/`APPROVED`) bookings on the same resource while allowing back-to-back slots.
* **Dashboard & Admin Controls:** Live ticket/booking statistics and admin approval/rejection workflows.

## Tech Stack
* **Backend:** Node.js, Express, TypeScript, `pg` (PostgreSQL), `bcryptjs`, `jsonwebtoken`
* **Database:** Neon PostgreSQL (`pgcrypto`, `btree_gist`)
* **Frontend:** React, TypeScript, Vite, `react-router-dom`
* **Deployment:** Render (Backend), Vercel (Frontend)

## Project Structure
```text
engnf1-fullstack-Iamankit2004/
├── backend/
│   ├── src/
│   │   ├── db/           # pool.ts, schema.sql, migrate.ts, seed.ts
│   │   ├── middleware/   # auth.ts, errorHandler.ts
│   │   ├── routes/       # auth, tickets, resources, bookings, stats, admin
│   │   ├── types/        # express.d.ts
│   │   └── utils/        # asyncHandler, classifier, validators
│   └── .env.example
├── frontend/
│   └── src/              # api.ts, components/, pages/, App.tsx
├── README.md
├── SOLUTION.md
└── AI_USAGE.md