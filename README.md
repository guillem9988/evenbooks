# MatchInvoice

> Open-source invoicing, AI-powered receipt extraction, bank reconciliation, and tax management for freelancers (*autònoms*) and SMEs in Spain.

MatchInvoice is a complete, self-hostable SaaS solution tailored to Spanish and European fiscal requirements (IVA, IRPF, NIF/CIF, Modelo 303, Modelo 130).

---

## ✨ Features

- **🧾 Sales & Invoicing (`/ingressos`)**: Create and manage invoices with customized series, client NIF/CIF validation, catalog items, rectificative invoices, and professional PDF generation.
- **📑 Quotes & Recurring (`/pressupostos`, `/recurrents`)**: Generate estimates, convert quotes to invoices upon approval, and automate recurring monthly/quarterly billings.
- **🤖 AI & OCR Expense Ingestion (`/despeses`)**: Upload invoice PDFs, photos, and scanned receipts. Automatically extracts vendor name, tax ID, invoice number, date, VAT, and totals. Includes full manual review and correction tools.
- **🏦 Automated Bank Reconciliation (`/banc`)**: Import bank statements in `.csv`, `.xlsx`, `.ofx`, or `.qfx` formats (compatible with CaixaBank, BBVA, Santander, Sabadell, N26, Revolut, etc.) and match transactions automatically with invoices using PostgreSQL `pg_trgm` fuzzy matching.
- **🏷️ Automatic expense categories**: Each new expense is categorized from what you chose before for the same vendor, then the AI extractor's guess, then keyword rules for common Spanish vendors.
- **🏛️ Tax Management (`/impostos`)**: Quarterly preview of **Modelo 303** (IVA repercutit vs suportat) and **Modelo 130** (accumulated from 1 January, net of VAT, with a box-by-box breakdown), plus an AEAT deadline calendar on the dashboard.
- **📊 Dashboard**: 12-month income vs expenses chart, receivables ageing with one-click payment reminders, and a to-do list.
- **📦 Accountant Pack (`/reports`)**: Export quarterly ZIP bundles with clean, renamed invoice PDFs and official AEAT-compatible Excel/CSV ledger summaries.
- **⚙️ Per-Organization API Settings (`/configuracio`)**:
  - Each user or organization can configure their own **OpenAI API Key** (`sk-...`) or **Google Document AI** service account credentials directly in the web UI.
  - Choose between extraction modes: **Auto** (best quality fallback), **OpenAI**, **Google Document AI**, or **Local OCR only** (100% private, no third-party data transmission).
  - Configure a custom **API Server URL** to connect the web interface to self-hosted or local backend instances.
- **🌐 Multilingual**: Native support for **Catalan (Català)**, **Spanish (Español)**, and **English**.
- **🔒 Integer Cents Precision**: All monetary values are handled in integer cents (`bigint` in Postgres), preventing floating-point arithmetic rounding errors.

---

## 🏗️ Architecture

- **Web Frontend (`web/`)**: Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS, Base UI, Lucide icons.
- **Backend API (`src/`)**: Fastify, TypeScript, Prisma ORM, BullMQ worker for asynchronous invoice OCR jobs.
- **Database**: PostgreSQL 16 with `pg_trgm` (trigram fuzzy matching) and `pgcrypto`.
- **Cache & Queues**: Redis 7 for BullMQ extraction queue.
- **Object Storage**: S3-compatible storage (SeaweedFS locally, Supabase Storage or AWS S3 in production).

---

## 🚀 Quickstart (Local Development)

### Prerequisites

- [Node.js](https://nodejs.org/) (version 20 or newer)
- [Docker](https://www.docker.com/) with Compose v2

### 1. Clone the repository

```bash
git clone https://github.com/guillem9988/invoices.git
cd invoices
```

### 2. Start dependencies with Docker Compose

Starts PostgreSQL, Redis, and S3-compatible storage (SeaweedFS) on local ports, and creates the bucket:

```bash
docker compose up -d
```

### 3. Setup and start Backend API

```bash
cp .env.example .env
npm install
npx prisma migrate deploy
npm run dev
```

The API starts on `http://127.0.0.1:43123`. Check health at `http://127.0.0.1:43123/health`.

### 4. Setup and start Frontend Web App

In a new terminal:

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ⚙️ Configuration from Web Settings (`/configuracio`)

Users can manage their credentials and connections directly from the UI without modifying server environment variables:

1. **AI Extraction Mode**: Select between *Automatic*, *OpenAI Vision*, *Google Document AI*, or *Local OCR (Tesseract)*.
2. **OpenAI**: Enter your `sk-...` API key and click **"Verifica la connexió"** to test it live.
3. **Google Document AI**: Enter your Project ID, Processor ID, Region (`eu` or `us`), and upload your Service Account JSON key.
4. **API Backend Connection**: Point your web interface to any self-hosted or custom backend URL.

---

## 🚢 Deployment

MatchInvoice is designed to be easily deployed on modern cloud platforms:

- **Frontend**: [Vercel](https://vercel.com) (run `cd web && npx vercel deploy --prod`)
- **Backend**: [Render](https://render.com) (via `Dockerfile` and `render.yaml`), [Railway](https://railway.app), or any Docker host.
- **Database & Storage**: [Supabase](https://supabase.com) (Postgres + Storage) or self-hosted PostgreSQL + any S3-compatible store.
- **Queue**: [Upstash](https://upstash.com) Redis or self-hosted Redis.

See [`DEPLOY.md`](DEPLOY.md) for the deployment guide.

### Running a public instance

- Keep sign-up closed (`ALLOW_PUBLIC_REGISTRATION=false`, the production default) or invite-only (`REGISTRATION_INVITE_CODE`). Open sign-up lets anyone spend your server-wide AI keys and send email from your domain.
- Set `GOOGLE_CLIENT_ID` on the API if you enable Google sign-in; without it the API refuses Google tokens.
- If the web app reaches the API through its `/backend` proxy (`API_PROXY_URL` on Vercel), use `COOKIE_SAME_SITE=lax` so the session cookie is first-party.

## 🔐 Security

Please report vulnerabilities privately as described in [`SECURITY.md`](SECURITY.md).

---

## 🛠️ Project Structure

```
├── docker-compose.yml         # Local Postgres, Redis, and S3 (SeaweedFS)
├── prisma/
│   ├── schema.prisma          # Database schema & relations
│   └── migrations/            # SQL migration history
├── src/
│   ├── server.ts              # Fastify server entrypoint
│   ├── config.ts              # Environment & system extractor configuration
│   ├── auth/                  # Organization guard & session management
│   ├── invoices/              # Invoice parsing (Document AI, OpenAI, Tesseract)
│   ├── matching/              # Trigram reconciliation engine
│   ├── routes/                # REST API endpoints (invoices, expenses, settings...)
│   └── workers/               # BullMQ background worker for OCR
├── web/                       # Next.js 16 frontend application
│   ├── src/app/               # App Router pages (/ingressos, /despeses, /configuracio...)
│   ├── src/components/        # UI components & dialogs
│   ├── src/i18n/              # Localizations (ca, es, en)
│   └── src/lib/               # API client and money helpers
└── docs/                      # Deployment and architecture runbooks
```

---

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).
