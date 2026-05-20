# SERMACROPS EDI Process Flow Manager

A MERN-stack web application for managing and monitoring Electronic Data Interchange (EDI) documents across the Order-to-Cash lifecycle. Tracks EDI X12 transaction sets (850, 855, 856, 810, 204, 990), partner companies, inbound/outbound document flow, and audit logs.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/sermacrops-edi run dev` — run the frontend (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes to PostgreSQL (dev only)

## Required Secrets

- `MONGODB_URI` — MongoDB connection string (for EDI documents, companies, transactions)
- `DATABASE_URL` — Auto-provisioned by Replit PostgreSQL (for audit logs, schema-driven tables)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite 7 + Tailwind CSS v4 + Radix UI + Wouter routing
- API: Express 5 (port 8080)
- DB: MongoDB (Mongoose) + PostgreSQL (Drizzle ORM)
- Validation: Zod (v4), drizzle-zod
- API codegen: Orval (from OpenAPI spec in lib/api-spec/openapi.yaml)
- Build: esbuild

## Where things live

- `artifacts/api-server/` — Express backend, models, routes, X12 generation engine
- `artifacts/sermacrops-edi/` — React frontend (Vite)
- `artifacts/mockup-sandbox/` — UI prototyping environment (port 8081)
- `lib/db/` — Drizzle ORM schema + PostgreSQL connection
- `lib/api-spec/` — OpenAPI spec (source of truth for API contract)
- `lib/api-zod/` — Auto-generated Zod schemas
- `lib/api-client-react/` — Auto-generated React Query hooks

## Architecture decisions

- MongoDB used for core business entities (EDI documents, companies, transactions) for flexible document storage
- PostgreSQL + Drizzle ORM used for schema-driven tables (audit logs, partner endpoints)
- Frontend proxies `/api` requests to the backend at `localhost:8080` via Vite dev server proxy
- OpenAPI spec is the single source of truth; Zod schemas and React Query hooks are generated from it

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Frontend must run on port 5000 for the Replit webview preview to work
- API server runs on port 8080; frontend Vite config proxies `/api` calls there
- Run `pnpm --filter @workspace/db run push` after any schema changes in `lib/db/src/schema/`
- Run `pnpm --filter @workspace/api-spec run codegen` after changing the OpenAPI spec
