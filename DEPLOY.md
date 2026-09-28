# Desplegament de MatchInvoice

Guia pas a pas per posar MatchInvoice en producció amb plans gratuïts:

| Peça | Servei | Què hi viu |
| --- | --- | --- |
| Base de dades | **Supabase** (Postgres) | Totes les dades, en cèntims enters |
| Fitxers | **Supabase Storage** (API compatible S3) | PDF i fotos de factures rebudes |
| Cua | **Upstash Redis** | Cua BullMQ d’anàlisi de factures |
| API | **Render** (Docker) | Fastify + worker de factures, en un sol procés |
| Panell web | **Vercel** | Next.js de la carpeta `web/` |

Ordre: **GitHub → Supabase → Upstash → Render → Vercel → tornar a Render (WEB_ORIGIN) → verificació.**

Totes les regions: **Frankfurt (UE, `eu-central-1`)**. Render només té Frankfurt a Europa, i posar la base de dades i Redis al mateix lloc evita latència entre serveis. És la regió de Render més propera a Espanya.

> **Secrets.** Cap valor real va al git, a un issue, a un xat ni a una captura. Els valors van només als panells d’Environment de Render i Vercel. Les plantilles són `.env.production.example` (API) i `web/.env.production.example` (web). Les variables `NEXT_PUBLIC_*` acaben dins del JavaScript del navegador: mai hi posis un secret.

Si vols que un agent (Codex amb computer use) ho faci al navegador, segueix [`docs/codex-computer-use-deploy.md`](docs/codex-computer-use-deploy.md).

---

## 0. Abans de començar

Comptes que has de crear (tots amb pla gratuït, cap targeta necessària en principi):

1. **GitHub** — ja tens el repositori `guillem9988/invoices`.
2. **Supabase** — https://supabase.com (entra amb GitHub).
3. **Upstash** — https://console.upstash.com (entra amb GitHub o correu).
4. **Render** — https://dashboard.render.com (entra amb GitHub).
5. **Vercel** — https://vercel.com (entra amb GitHub, pla **Hobby**).
6. *(Opcional)* **OpenAI** — només si vols llegir fotos de tiquets amb IA. Sense clau, els PDF amb text es llegeixen igualment i les fotos passen per Tesseract.

Tingues a mà un gestor de contrasenyes per guardar-hi els valors a mesura que apareguin.

Limitacions dels plans gratuïts que cal conèixer:

- **Render Free** s’atura després de 15 minuts sense trànsit. La primera petició després triga uns 30–60 segons. Les factures pujades mentre dorm es processen quan es desperta.
- **Supabase Free** pausa el projecte després d’una setmana sense activitat. Es reactiva des del panell.
- **Upstash Free** dona 500.000 comandes al mes. El worker està configurat per consultar Redis cada 5 minuts quan no hi ha feina, i Render comprova `/health/live`, que no toca Redis.
- **Vercel Hobby** és per a ús personal i no comercial.

---

## 1. GitHub

1. Obre https://github.com/guillem9988/invoices i comprova que la branca `main` conté `Dockerfile`, `render.yaml` i `web/`.
2. El repositori pot ser privat. Render i Vercel et demanaran permís per llegir-lo.

---

## 2. Supabase (Postgres + Storage)

### 2.1 Crear el projecte

1. https://supabase.com/dashboard → **New project**.
2. **Organization**: la teva (crea’n una si t’ho demana, pla **Free**).
3. **Project name**: `matchinvoice`.
4. **Database Password**: prem **Generate a password** i **copia-la al gestor de contrasenyes**. Només la veuràs ara.
   Si la tries tu, fes-la només amb lletres i números: així no cal codificar-la a la URL.
5. **Region**: **Central EU (Frankfurt)**.
6. **Create new project**. Espera un parell de minuts fins que el projecte estigui a punt.

### 2.2 URL de la base de dades → `DATABASE_URL`

1. Al projecte, botó **Connect** (barra superior).
2. Busca la cadena **Session pooler** (port **5432**). No facis servir «Direct connection» (només IPv6, Render no hi arriba) ni «Transaction pooler» (port 6543, no serveix per a les migracions).
3. Copia la URI. Té aquesta forma:
   `postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`
4. Substitueix `[YOUR-PASSWORD]` per la contrasenya del pas 2.1 (sense claudàtors). Si té símbols, codifica’ls: `@` → `%40`, `#` → `%23`, `/` → `%2F`, `?` → `%3F`.
5. Aquest valor és **`DATABASE_URL`**. És secret.

No cal afegir `?sslmode=require`: en producció l’API ja xifra la connexió amb Postgres. `DIRECT_URL` es pot deixar buit; les migracions fan servir `DATABASE_URL`.

**Extensions `pg_trgm` i `pgcrypto`.** La primera migració fa `CREATE EXTENSION IF NOT EXISTS pgcrypto` i `pg_trgm`. Totes dues són *trusted* a Postgres 13+ i l’usuari `postgres` de Supabase les pot crear, així que no cal fer res a mà. Si ja havies activat `pg_trgm` des de **Database → Extensions** a l’esquema `extensions`, també funciona, perquè el `search_path` de Supabase inclou aquest esquema.

### 2.3 Bucket privat

1. Menú esquerre **Storage** → **New bucket**.
2. **Name**: `matchinvoice`.
3. **Public bucket**: **desactivat** (les factures són privades).
4. **Create bucket** / **Save**.

### 2.4 Claus S3 → `S3_*`

1. **Storage** → **Settings** (a la part de configuració de Storage; en algunes versions es diu **S3 Configuration** o és a **Project Settings → Storage**).
2. Comprova que **S3 protocol connection** / **Enable connection via S3 protocol** està activat.
3. Copia:
   - **Endpoint** → `S3_ENDPOINT` (forma `https://<project-ref>.storage.supabase.co/storage/v1/s3`).
   - **Region** → `S3_REGION` (per exemple `eu-central-1`).
4. A **S3 Access Keys** → **New access key** → descripció `matchinvoice-api` → **Create access key**.
5. Copia a l’instant (el secret no es torna a mostrar):
   - **Access key ID** → `S3_ACCESS_KEY` (secret).
   - **Secret access key** → `S3_SECRET_KEY` (secret).
6. `S3_BUCKET=matchinvoice` i `S3_FORCE_PATH_STYLE=true` ja venen a `render.yaml`.

Aquestes claus donen accés complet a Storage i salten les polítiques RLS: només van al servidor (Render), mai al web.

---

## 3. Upstash Redis → `REDIS_URL`

1. https://console.upstash.com → **Redis** → **Create Database**.
2. **Name**: `matchinvoice`.
3. **Primary Region**: **eu-central-1 (Frankfurt)**. Sense read regions.
4. **Plan**: **Free**. Si et proposa Pay as You Go o Fixed, no l’acceptis.
5. **Eviction**: desactivat (BullMQ necessita que no s’esborrin claus).
6. **Create**.
7. A la pàgina de la base de dades, secció **Connect** → pestanya **TCP** (o **ioredis**): copia la URL que comença per **`rediss://`**:
   `rediss://default:<password>@<nom>.upstash.io:6379`
8. Aquest valor és **`REDIS_URL`**. És secret. Ha de començar per `rediss://` (amb dues `s`): és TLS.

---

## 4. Render (API)

### 4.1 Crear el servei amb el Blueprint

1. https://dashboard.render.com → **New** → **Blueprint**.
2. **Connect a repository** → autoritza GitHub si t’ho demana → tria `guillem9988/invoices`.
3. **Blueprint Name**: `matchinvoice`. Branca: `main`. Render llegeix `render.yaml` i mostra el servei **matchinvoice-api** (Docker, **Free**, **Frankfurt**).
4. Render demana els valors marcats com a secrets. Omple’ls:

| Variable | Valor | D’on surt |
| --- | --- | --- |
| `DATABASE_URL` | URI del Session pooler amb la contrasenya | Supabase, pas 2.2 |
| `REDIS_URL` | `rediss://default:…@….upstash.io:6379` | Upstash, pas 3 |
| `S3_ENDPOINT` | `https://<ref>.storage.supabase.co/storage/v1/s3` | Supabase, pas 2.4 |
| `S3_REGION` | `eu-central-1` | Supabase, pas 2.4 |
| `S3_ACCESS_KEY` | Access key ID | Supabase, pas 2.4 |
| `S3_SECRET_KEY` | Secret access key | Supabase, pas 2.4 |
| `WEB_ORIGIN` | `https://matchinvoice.vercel.app` (provisional) | El corregiràs al pas 6 |

Els altres valors ja venen fixats a `render.yaml`: `NODE_ENV=production`, `DATABASE_POOL_MAX=5`, `S3_BUCKET=matchinvoice`, `S3_FORCE_PATH_STYLE=true`, `COOKIE_SAME_SITE=none`, `COOKIE_SECURE=true`, `BULLMQ_DRAIN_DELAY_SECONDS=300`, `BULLMQ_STALLED_INTERVAL_MS=300000`.

5. **Deploy Blueprint** / **Apply**. Si Render demana targeta o proposa un pla de pagament, **no** l’acceptis: el servei ha de quedar en **Free**.

### 4.2 Què fa el desplegament

El `Dockerfile` instal·la dependències, i en arrencar executa `prisma migrate deploy` (crea les taules i les extensions) i després l’API. El worker de factures arrenca dins del mateix procés. Render comprova `/health/live`.

### 4.3 URL de l’API → `NEXT_PUBLIC_API_URL`

Quan el deploy acabi en **Live**, copia la URL de dalt de tot del servei, per exemple `https://matchinvoice-api.onrender.com`. Aquesta és la URL pública de l’API (no és secreta).

Comprova-la: obre `https://matchinvoice-api.onrender.com/health`. Ha de dir `"status":"ok"` i `"up"` a `postgres`, `redis` i `minio` (que aquí vol dir Supabase Storage).

### 4.4 Opcional: OpenAI

**Environment** → **Add Environment Variable** → `OPENAI_API_KEY` = la teva clau (https://platform.openai.com/api-keys). Desa i Render redesplega.

---

## 5. Vercel (panell web)

1. https://vercel.com/new → **Import Git Repository** → autoritza GitHub → **Import** al costat de `invoices`.
2. **Project Name**: `matchinvoice`.
3. **Framework Preset**: Next.js.
4. **Root Directory**: **Edit** → tria `web` → **Continue**.
5. **Environment Variables**:
   - `NEXT_PUBLIC_API_URL` = la URL de Render del pas 4.3, sense barra final.
6. **Deploy**. En acabar, copia el domini de producció (per exemple `https://matchinvoice.vercel.app`; si el nom estava agafat, serà `https://matchinvoice-xxxx.vercel.app`).

---

## 6. Tornar a Render: `WEB_ORIGIN`

1. Render → **matchinvoice-api** → **Environment**.
2. `WEB_ORIGIN` = el domini exacte de Vercel del pas 5, amb `https://` i **sense** barra final ni camí.
3. **Save Changes** → Render redesplega sol.

L’API només accepta peticions amb galetes des d’aquest origen (CORS). Les previsualitzacions de Vercel (`…-git-…vercel.app`) no hi entren; si les vols, afegeix-les separades per comes.

---

## 7. Verificació final

1. `https://<render>/health` → `"status":"ok"`, i `postgres`, `redis`, `minio` a `"up"`.
2. Obre el domini de Vercel. Ha d’aparèixer la pantalla **Entra al teu compte**.
3. **Registra’t** → omple nom, correu de prova, contrasenya (8+ caràcters), raó social i NIF → **Crea el compte**. Has d’arribar a **Inici**.
4. Tanca la sessió (icona de sortida a baix de la barra lateral) i torna a entrar amb el mateix correu i contrasenya.
5. Recarrega la pàgina: has de continuar dins. Això confirma que la galeta de sessió funciona entre Vercel i Render.
6. *(Opcional)* Puja un PDF a **Despeses** i comprova que passa a **Analitzada**.

---

## Si alguna cosa falla

**Render: el deploy falla a `prisma migrate deploy`.**
- `P1001 Can't reach database`: la URL no és la del **Session pooler** (port 5432) o la contrasenya és incorrecta.
- `password authentication failed`: revisa la contrasenya i la codificació dels símbols.
- Error de certificat a la migració: posa a `DIRECT_URL` la mateixa URL acabada en `?sslmode=require&sslaccept=accept_invalid_certs`.
- `permission denied to create extension`: a Supabase, **Database → Extensions**, activa `pg_trgm` i `pgcrypto` i torna a desplegar.

**Render: l’API arrenca i s’atura amb `WEB_ORIGIN is required in production`.** Falta `WEB_ORIGIN` a Environment.

**`/health` mostra `redis: down`.** `REDIS_URL` ha de començar per `rediss://`. Comprova a Upstash que la base de dades no està arxivada i que no has superat el límit mensual.

**`/health` mostra `minio: down`.** Revisa `S3_ENDPOINT` (ha d’acabar en `/storage/v1/s3`), `S3_REGION`, que el bucket `matchinvoice` existeix i que les claus S3 són les del mateix projecte. `SignatureDoesNotMatch` gairebé sempre és la regió.

**Vercel: el registre diu «No hi ha connexió amb el servidor».** `NEXT_PUBLIC_API_URL` és incorrecta, té barra final, o Render està dormint (espera un minut i torna-ho a provar). Després de canviar la variable cal **Redeploy** a Vercel, perquè s’incrusta en compilar.

**El navegador mostra un error de CORS.** `WEB_ORIGIN` a Render no coincideix exactament amb el domini de Vercel.

**Entres però en recarregar tornes a la pantalla d’inici de sessió (sobretot Safari o iPhone).** Safari bloqueja galetes de tercers. Canvia al mode proxy:
1. Vercel → **Settings → Environment Variables**: esborra `NEXT_PUBLIC_API_URL` i afegeix `API_PROXY_URL` = la URL de Render.
2. **Deployments** → **Redeploy**.
El panell cridarà `/backend/*` al seu propi domini i Vercel ho reenviarà a Render; la galeta passa a ser del domini de Vercel.

**Supabase: el projecte està pausat.** Obre’l al panell i prem **Restore project**.

---

## Variables de l’API (resum)

| Variable | Obligatòria | Exemple / valor |
| --- | --- | --- |
| `NODE_ENV` | Sí | `production` |
| `DATABASE_URL` | Sí | Session pooler de Supabase |
| `DIRECT_URL` | No | Només si les migracions necessiten una altra URL |
| `DATABASE_SSL` | No | `no-verify` per defecte en producció; `verify` o `disable` |
| `DATABASE_CA_CERT` | No | Certificat CA de Supabase en una línia amb `\n` |
| `DATABASE_POOL_MAX` | No | `5` |
| `REDIS_URL` | Sí | `rediss://default:…@….upstash.io:6379` |
| `BULLMQ_DRAIN_DELAY_SECONDS` | No | `300` |
| `BULLMQ_STALLED_INTERVAL_MS` | No | `300000` |
| `S3_ENDPOINT` | Sí | `https://<ref>.storage.supabase.co/storage/v1/s3` |
| `S3_REGION` | Sí | `eu-central-1` |
| `S3_BUCKET` | Sí | `matchinvoice` |
| `S3_ACCESS_KEY` | Sí | Access key ID de Supabase |
| `S3_SECRET_KEY` | Sí | Secret access key de Supabase |
| `S3_FORCE_PATH_STYLE` | Sí | `true` |
| `WEB_ORIGIN` | Sí | `https://matchinvoice.vercel.app` |
| `COOKIE_SAME_SITE` | No | `none` en producció |
| `COOKIE_SECURE` | No | `true` en producció |
| `COOKIE_DOMAIN` | No | Buit |
| `TRUST_PROXY` | No | `true` en producció |
| `OPENAI_API_KEY` | No | Clau d’OpenAI |

## Variables del web

| Variable | Obligatòria | Valor |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | Sí (mode A) | URL de Render |
| `API_PROXY_URL` | Només mode B | URL de Render, amb `NEXT_PUBLIC_API_URL` buida |

En local no cal res d’això: `docker compose up -d`, `npm run dev` a l’arrel i `npm run dev` a `web/` fan servir MinIO, Redis i Postgres locals.
