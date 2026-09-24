# MatchInvoice

Automated bank-transaction and invoice reconciliation for freelancers and SMEs, with Spanish and Catalan tax context (IVA, NIF/CIF).

This is the reconciliation API and the review panel. Postgres, Redis, MinIO, statement ingest, invoice extraction, matching, and the accountant ZIP are in place. Amounts are integer cents (`bigint` / `BIGINT`), never floats.

## Prerequisites

- Node.js 20 or newer
- Docker with Compose v2

## Run locally

```bash
cp .env.example .env
docker compose up -d
npm install
npx prisma migrate deploy
npm run dev
```

The API listens on [http://127.0.0.1:43123](http://127.0.0.1:43123). The same defaults are compiled in, so the process also boots if you skip copying `.env` and the Compose stack is up.

`GET /health` runs `SELECT 1` against Postgres. The HTTP status is 200 only when that query succeeds, and 503 when it does not. Redis and MinIO are checked on the same response and reported separately; if either is down the body still returns 200 as long as Postgres is up.

```json
{
  "status": "ok",
  "postgres": { "status": "up" },
  "redis": { "status": "up" },
  "minio": { "status": "up" }
}
```

## Ports

Compose publishes uncommon host ports. The API environment variables point at those host ports, not the ports inside the containers.

| Service | Host port | Container port | Env var |
| --- | --- | --- | --- |
| Postgres 16 | 54329 | 5432 | `DATABASE_URL=postgresql://matchinvoice:matchinvoice@localhost:54329/matchinvoice` |
| Redis 7 | 63799 | 6379 | `REDIS_URL=redis://localhost:63799` |
| MinIO API | 59000 | 9000 | `S3_ENDPOINT=http://localhost:59000` |
| MinIO console | 59001 | 9001 | open [http://127.0.0.1:59001](http://127.0.0.1:59001) |
| API | 43123 | — | `PORT=43123` |
| Review panel | 43124 | — | `NEXT_PUBLIC_API_URL` |

MinIO root user is `matchinvoice` / `matchinvoice-secret`. The server image is `quay.io/minio/minio` and the bucket sidecar is `quay.io/minio/mc` (Docker Hub no longer serves `minio/minio`). The sidecar creates the `matchinvoice` bucket and then exits. That one-shot container is expected to show as exited once the bucket exists.

`pg_trgm` does not need `shared_preload_libraries`. The initial migration runs `CREATE EXTENSION` for `pgcrypto` and `pg_trgm`, then creates the trigram GIN indexes.

## Scripts

- `npm run dev` — API with reload
- `npm start` — API once
- `npm test` — Vitest (money is integer cents)
- `npm run typecheck` — `tsc --noEmit`
- `npx prisma migrate deploy` — apply SQL migrations

## Layout

```
docker-compose.yml
.env.example
prisma.config.ts
prisma/schema.prisma
prisma/migrations/
src/server.ts
src/config.ts
src/routes/health.ts          dependency health
src/routes/reconcile.ts       POST /organizations/:id/reconcile
src/routes/statements.ts      POST /organizations/:id/statements
src/routes/invoices.ts        POST /organizations/:id/invoices
src/invoices/                 text and vision extraction
src/workers/invoice-worker.ts BullMQ invoice-processing-queue
src/statements/               CSV bank-statement ingest
src/lib/money.ts              integer cents
src/lib/prisma.ts             Postgres
src/lib/redis.ts              Redis
src/lib/storage.ts            MinIO / S3
src/lib/queue.ts              BullMQ connection; no worker is started
src/matching/                 amount, date, text, and vendor scores
src/routes/organizations.ts   POST /organizations
src/routes/reconciliation.ts  review, confirm, reject
src/reports/                  accountant ZIP export
web/                          Next.js review panel on port 43124
```

`npm install` generates the Prisma client into `generated/prisma` (gitignored).

## Bank statements

`POST /organizations/<uuid>/statements` uploads a statement (`multipart/form-data`, file field, optional `source_bank`). The same field accepts `.csv`, `.ofx` / `.qfx`, and `.xlsx`. CSV and the first Excel sheet use `Date`/`Description`/`Amount` or `Fecha`/`Concepto`/`Importe`, or debit/credit columns (`Debe`/`Haber`). OFX reads each `STMTTRN` (`DTPOSTED`, `TRNAMT`, `NAME` or `MEMO`). Amounts are stored as signed cents. A European decimal comma such as `-121,00` is an expense of 12100 cents. An unknown extension, an unreadable file, or a file with no transactions is 400. The response is the statement id and `totalTransactions`.

```bash
curl -X POST http://127.0.0.1:43123/organizations/<organization-uuid>/statements \
  -F source_bank=Caixa \
  -F file=@movements.csv
```

## Invoices

`POST /organizations/<uuid>/invoices` accepts one or many PDF, PNG, or JPEG parts. Each file is stored in MinIO, inserted as `UPLOADED`, queued on `invoice-processing-queue`, then marked `PROCESSING`. The response is `202` with `invoiceIds`. The request handler does not call OpenAI.

The worker reads the object. A PDF with an embedded text layer is parsed as text. Images and scanned PDFs use `gpt-4o-mini` vision when `OPENAI_API_KEY` is set. Without that key, labeled text is parsed locally and image-only files become `FAILED`. Amounts are integer cents. A parsed invoice triggers reconciliation for that organization. One failed file does not stop the queue.

## Matching

`reconcileOrganization` loads unmatched transactions and parsed invoices, scores every pair, and keeps a one-to-one assignment. Weights are amount 0.45, date 0.20, text 0.20, and vendor 0.15. Amount is 1.00 on exact absolute cents, 0.90 within 2 cents of the total, and 0.85 when the cents equal the invoice base. A score of at least 0.88 is stored with `is_auto_confirmed` and the transaction becomes `AUTO_MATCHED`. Scores from 0.65 up to 0.88 are suggestions and are not inserted. Lower scores are discarded. `matching_breakdown` stores the four sub-scores and the weights.

```bash
curl -X POST http://127.0.0.1:43123/organizations/<organization-uuid>/reconcile
```

An unknown organization is 404. A non-UUID id is 400.

## Review

`POST /organizations` with `{ "legalName", "taxId" }` creates a company and returns its id.

`GET /organizations/<uuid>/reconciliation/review` lists suggestions in `[0.65, 0.88)` with the breakdown, the bank line, and the invoice. Those rows are computed, not required to already exist. The same payload includes stored auto-matched rows.

`POST /organizations/<uuid>/reconciliation/matches` with `{ "transactionId", "invoiceId" }` confirms a suggestion (`is_auto_confirmed` false, transaction `MANUALLY_MATCHED`). A second match on either id is 409.

`POST /organizations/<uuid>/reconciliation/matches/<id>/reject` deletes that stored match and sets the transaction back to `UNMATCHED`.

## Review panel

```bash
cd web && npm install && npm run dev
```

The panel listens on [http://127.0.0.1:43124](http://127.0.0.1:43124) and calls `NEXT_PUBLIC_API_URL` (default `http://127.0.0.1:43123`).

## Accountant export

`GET /organizations/<uuid>/reports/accountant-export?from=YYYY-MM-DD&to=YYYY-MM-DD` returns `application/zip`. A missing or invalid range is 400. An unknown organization is 404.

The archive contains `resum_trimestral.csv` (one row per bank transaction in the range), `factures/` (matched invoice files renamed `YYYYMMDD_Vendor_TotalEUR_Id`), and `anomalies_sense_justificant.txt` (unmatched expenses). A missing object is listed in the anomalies file and does not fail the download.
