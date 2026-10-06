# Desplegament de Evenbooks

Guia pas a pas per posar Evenbooks en producció amb plans gratuïts:

| Peça | Servei | Què hi viu |
| --- | --- | --- |
| Base de dades | **Supabase** (Postgres) | Totes les dades, en cèntims enters |
| Fitxers | **Supabase Storage** (API compatible S3) | PDF i fotos de factures rebudes |
| Cua | **Upstash Redis** | Cua BullMQ d’anàlisi de factures |
| API | **Render** (Docker) | Fastify + worker de factures, en un sol procés |
| Panell web | **Vercel** | Next.js de la carpeta `web/` |

Ordre: **GitHub → Supabase → Upstash → Render → Vercel → tornar a Render (WEB_ORIGIN) → verificació.** GitHub i Supabase ja estan fets. El que falta és **Upstash → Render → Vercel**.

Supabase ja és a **Sydney (`ap-southeast-2`)**, no a Frankfurt ni a `eu-central-1`. **Upstash Redis** i **Render** s’han de crear a la regió més propera a Sydney que el seu pla gratuït ofereixi: **Sydney** si hi surt, i si no **Singapore**. No els creïs a Frankfurt. **Vercel** pot quedar **global**: no cal fixar cap regió.

> **Secrets.** Cap valor real va al git, a un issue, a un xat ni a una captura. Els valors van només als panells d’Environment de Render i Vercel. Les plantilles són `.env.production.example` (API) i `web/.env.production.example` (web). Les variables `NEXT_PUBLIC_*` acaben dins del JavaScript del navegador: mai hi posis un secret.

Si vols que un agent (Codex amb computer use) ho faci al navegador, segueix [`docs/codex-computer-use-deploy.md`](docs/codex-computer-use-deploy.md).

---

## 0. Abans de començar

Comptes que has de crear (tots amb pla gratuït, cap targeta necessària en principi):

1. **GitHub** — ja tens el repositori `guillem9988/invoices`.
2. **Supabase** — https://supabase.com: crea un projecte (ex. `invoices`).
3. **Upstash** — https://console.upstash.com (entra amb GitHub o correu).
4. **Render** — https://dashboard.render.com (entra amb GitHub).
5. **Vercel** — https://vercel.com (entra amb GitHub, pla **Hobby**).
6. *(Opcional)* **Google Cloud** — per llegir factures amb **Document AI** (Invoice Parser).
7. *(Opcional)* **OpenAI** — només si vols llegir fotos de tiquets amb IA.

---

## 1. GitHub

1. Obre el teu repositori a GitHub i comprova que la branca `main` conté `Dockerfile`, `render.yaml` i `web/`.
2. El repositori pot ser públic o privat. Render i Vercel et demanaran permís per llegir-lo.

---

## 2. Supabase (Postgres + Storage)

Configuració del projecte de Supabase:

| | |
| --- | --- |
| Nom | `invoices` |
| Ref | `<el-teu-project-ref>` |
| Session pooler | `aws-0-[regio].pooler.supabase.com`, port **5432** |
| Bucket | `matchinvoice`, privat |
| Extensions | `pg_trgm` i `pgcrypto` activades |

La URI del Session pooler té aquesta forma:

`postgresql://postgres.[PROJECT_REF]:[CONTRASENYA]@aws-0-[REGIO].pooler.supabase.com:5432/postgres`

No facis servir «Direct connection» (només IPv6, Render no hi arriba) ni «Transaction pooler» (port 6543). No cal afegir `?sslmode=require`: en producció l’API ja xifra la connexió amb Postgres. `DIRECT_URL` es pot deixar buit.

Els valors reals de `DATABASE_URL`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` i `S3_FORCE_PATH_STYLE` ja són al fitxer local `.env.production.local` (arrel del repositori; el git l’ignora). En crear Render, copia’ls al panell d’Environment. No els copiïs al git, a un xat, a un issue ni aquí. `S3_REGION` és `ap-southeast-2`. `S3_BUCKET` és `matchinvoice` i `S3_FORCE_PATH_STYLE` és `true` (també fixats a `render.yaml`).

Les claus S3 donen accés complet a Storage i salten les polítiques RLS: només van al servidor (Render), mai al web. No cal crear-ne una de nova mentre les del fitxer local segueixin vigents. El secret d’una clau ja creada no es torna a mostrar al panell.

---

## 3. Upstash Redis → `REDIS_URL`

1. https://console.upstash.com → **Redis** → **Create Database**.
2. **Name**: `matchinvoice`.
3. **Primary Region**: la més propera a Sydney que el pla **Free** ofereixi. Tria **Sydney** si hi surt; si no, **Singapore**. Sense read regions. No triïs Frankfurt.
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
3. **Blueprint Name**: `matchinvoice`. Branca: `main`. Render llegeix `render.yaml` i mostra el servei **matchinvoice-api** (Docker, **Free**). El fitxer encara té `region: frankfurt`. Abans d’aplicar, canvia la regió del servei a la més propera a Sydney que el pla **Free** ofereixi: **Sydney** si hi surt, i si no **Singapore**. Si la pantalla no deixa canviar la regió, no despleguis a Frankfurt.
4. Render demana els valors marcats com a secrets. Omple’ls:

| Variable | Valor | D’on surt |
| --- | --- | --- |
| `DATABASE_URL` | URI del Session pooler, rol `matchinvoice`, host `aws-0-ap-southeast-2.pooler.supabase.com:5432` | `.env.production.local` |
| `REDIS_URL` | `rediss://default:…@….upstash.io:6379` | Upstash, pas 3 |
| `S3_ENDPOINT` | Endpoint S3 del projecte (acaba en `/storage/v1/s3`) | `.env.production.local` |
| `S3_REGION` | `ap-southeast-2` | `.env.production.local` |
| `S3_ACCESS_KEY` | Access key ID | `.env.production.local` |
| `S3_SECRET_KEY` | Secret access key | `.env.production.local` |
| `WEB_ORIGIN` | `https://matchinvoice.vercel.app` (provisional) | El corregiràs al pas 6 |
| `GOOGLE_CLOUD_PROJECT_ID`, `DOCUMENT_AI_PROCESSOR_ID`, `GOOGLE_APPLICATION_CREDENTIALS_JSON` | Buits de moment | Opcional, pas 4.5 |

Els altres valors ja venen fixats a `render.yaml`: `NODE_ENV=production`, `DATABASE_POOL_MAX=5`, `S3_BUCKET=matchinvoice`, `S3_FORCE_PATH_STYLE=true`, `COOKIE_SAME_SITE=none`, `COOKIE_SECURE=true`, `BULLMQ_DRAIN_DELAY_SECONDS=300`, `BULLMQ_STALLED_INTERVAL_MS=300000`, `INVOICE_EXTRACTOR=auto`, `DOCUMENT_AI_LOCATION=eu`.

5. **Deploy Blueprint** / **Apply**. Si Render demana targeta o proposa un pla de pagament, **no** l’acceptis: el servei ha de quedar en **Free**.

### 4.2 Què fa el desplegament

El `Dockerfile` instal·la dependències, i en arrencar executa `prisma migrate deploy` i després l’API. En aquest projecte les migracions **ja estan aplicades**, així que el log ha de dir que no n’hi ha de pendents. El worker de factures arrenca dins del mateix procés. Render comprova `/health/live`.

### 4.3 URL de l’API → `NEXT_PUBLIC_API_URL`

Quan el deploy acabi en **Live**, copia la URL de dalt de tot del servei, per exemple `https://matchinvoice-api.onrender.com`. Aquesta és la URL pública de l’API (no és secreta).

Comprova-la: obre `https://matchinvoice-api.onrender.com/health`. Ha de dir `"status":"ok"` i `"up"` a `postgres`, `redis` i `minio` (el nom històric del bloc S3; aquí vol dir Supabase Storage).

### 4.4 Opcional: OpenAI

**Environment** → **Add Environment Variable** → `OPENAI_API_KEY` = la teva clau (https://platform.openai.com/api-keys). Desa i Render redesplega.

### 4.5 Opcional: Google Document AI (Invoice Parser)

> Document AI **necessita un compte de facturació de Google Cloud** vinculat al projecte (targeta), encara que tinguis crèdit gratuït. Es cobra per pàgina. Posa un pressupost amb alertes a **Billing → Budgets & alerts**.

1. **Projecte.** https://console.cloud.google.com → selector de projecte → **New project** → nom `matchinvoice` → **Create**. Anota el **Project ID** (no el *number*) → **`GOOGLE_CLOUD_PROJECT_ID`**.
2. **Facturació.** **Billing** → **Link a billing account** (o crea’n un) per al projecte `matchinvoice`.
3. **API.** https://console.cloud.google.com/apis/library/documentai.googleapis.com → **Enable**.
4. **Processador.** **Document AI** → **Processor gallery** → **Invoice Parser** → **Create processor** → nom `matchinvoice-invoices`, **Region: EU** → **Create**. A **Processor details**, copia l’**ID** → **`DOCUMENT_AI_PROCESSOR_ID`**. La regió `eu` és **`DOCUMENT_AI_LOCATION`** (ja ve a `render.yaml`).
5. **Compte de servei.** **IAM & Admin → Service Accounts** → **Create service account** → nom `matchinvoice-docai` → rol **Document AI API User** (`roles/documentai.apiUser`), cap altre → **Done**.
6. **Clau JSON.** Obre el compte → **Keys** → **Add key → Create new key → JSON**. Es descarrega un fitxer: és **secret**.
7. **Render** → **matchinvoice-api** → **Environment**:
   - `GOOGLE_CLOUD_PROJECT_ID` = Project ID (pas 1);
   - `DOCUMENT_AI_PROCESSOR_ID` = ID del processador (pas 4);
   - `GOOGLE_APPLICATION_CREDENTIALS_JSON` = contingut sencer del fitxer JSON (pas 6). Si el camp no accepta salts de línia: `jq -c . ~/Downloads/<fitxer>.json | pbcopy` i enganxa.
   Desa. Després guarda el JSON al gestor de contrasenyes i esborra’l de Descàrregues.
8. **Comprova**: puja una factura a **Despeses** i ha de passar a **Analitzada**. Si Document AI falla, l’API prova el següent lector i el motiu queda registrat a la factura.

---

## 5. Vercel (panell web)

1. https://vercel.com/new → **Import Git Repository** → autoritza GitHub → **Import** al costat de `invoices`.
2. **Project Name**: `matchinvoice`. No cal triar regió: Vercel es queda **global**.
3. **Framework Preset**: Next.js.
4. **Root Directory**: **Edit** → tria `web` → **Continue**.
5. **Environment Variables** (mode proxy, recomanat — mateixa-origen i galetes de primera part):
   - `API_PROXY_URL` = la URL de Render del pas 4.3, sense barra final.
   - **No** posis `NEXT_PUBLIC_API_URL` (o deixa-la buida). Si existeix, esborra-la: amb ella el navegador crida Render en cross-site i Safari / molts navegadors bloquegen la galeta de sessió (l’**Entra** sembla que no fa res).
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
2. Obre el domini de Vercel. Ha d’aparèixer la pantalla **Entra al teu compte**. El registre públic està **tancat** en producció (`ALLOW_PUBLIC_REGISTRATION=false`) tret que hi hagi `REGISTRATION_INVITE_CODE`.
3. Si ja tens compte: **Entra** amb correu i contrasenya. Has d’arribar a **Inici**. Les peticions han d’anar a `/backend/*` al mateix domini (no a `onrender.com` des del navegador).
4. Tanca la sessió (icona de sortida a baix de la barra lateral) i torna a entrar amb el mateix correu i contrasenya.
5. Recarrega la pàgina: has de continuar dins. Això confirma que la galeta de sessió (primera part via proxy) funciona.
6. *(Opcional)* Puja un PDF a **Despeses** i comprova que passa a **Analitzada**.

---

## Si alguna cosa falla

**Upstash o Render: el pla Free no ofereix Sydney ni Singapore.** No creïs el servei a Frankfurt ni acceptis un pla de pagament. Atura’t.

**Render: el deploy falla a `prisma migrate deploy`.**
- `P1001 Can't reach database`: la URL no és la del **Session pooler** (port 5432) o la contrasenya és incorrecta.
- `password authentication failed`: revisa la contrasenya i la codificació dels símbols.
- Error de certificat a la migració: posa a `DIRECT_URL` la mateixa URL acabada en `?sslmode=require&sslaccept=accept_invalid_certs`.
- `permission denied to create extension`: en aquest projecte `pg_trgm` i `pgcrypto` ja estan activades. Comprova que `DATABASE_URL` és el Session pooler de Sydney amb el rol `matchinvoice`, no l’usuari `postgres`. Si falten en un altre entorn, activa-les a **Database → Extensions** i torna a desplegar.

**Render: l’API arrenca i s’atura amb `WEB_ORIGIN is required in production`.** Falta `WEB_ORIGIN` a Environment.

**`/health` mostra `redis: down`.** `REDIS_URL` ha de començar per `rediss://`. Comprova a Upstash que la base de dades no està arxivada i que no has superat el límit mensual.

**`/health` mostra `minio: down`.** Revisa `S3_ENDPOINT` (ha d’acabar en `/storage/v1/s3`), `S3_REGION`, que el bucket `matchinvoice` existeix i que les claus S3 són les del mateix projecte. `SignatureDoesNotMatch` gairebé sempre és la regió.

**Vercel: el registre / l’entrada diu «No hi ha connexió amb el servidor».** `API_PROXY_URL` (o `NEXT_PUBLIC_API_URL` si encara el fas servir) és incorrecta, té barra final, o Render està dormint (espera un minut i torna-ho a provar). Després de canviar `NEXT_PUBLIC_*` cal **Redeploy** a Vercel, perquè s’incrusta en compilar. `API_PROXY_URL` també es llegeix en build (rewrites de Next).

**El navegador mostra un error de CORS.** Només passa en mode cross-site (`NEXT_PUBLIC_API_URL`). `WEB_ORIGIN` a Render no coincideix exactament amb el domini de Vercel. Amb `API_PROXY_URL` el navegador no fa CORS cap a Render.

**L’Entra sembla que no fa res, o entres i en recarregar tornes al login (Safari / iPhone).** Galetes de tercers bloquejades. Assegura el mode proxy:
1. Vercel → **Settings → Environment Variables**: esborra `NEXT_PUBLIC_API_URL` i afegeix (o mantén) `API_PROXY_URL` = la URL de Render.
2. **Deployments** → **Redeploy** (cal rebuild perquè el bundle deixi d’apuntar a `onrender.com`).
El panell cridarà `/backend/*` al seu propi domini i Vercel ho reenviarà a Render; la galeta passa a ser del domini de Vercel.

**Supabase: el projecte està pausat.** Obre’l al panell i prem **Restore project**.

**Document AI: factures amb `Document AI: … PERMISSION_DENIED`.** Si parla de *billing*, el projecte no té facturació; si parla de `processWithVersion`, al compte de servei li falta el rol **Document AI API User**. `NOT_FOUND`: `DOCUMENT_AI_PROCESSOR_ID` o el Project ID són incorrectes, o el processador no és a `eu`. `SERVICE_DISABLED`: activa l’API (pas 4.5.3).

**Render s’atura amb `GOOGLE_APPLICATION_CREDENTIALS_JSON must …`.** El JSON enganxat està incomplet o no és la clau del compte de servei. Torna a enganxar el fitxer sencer.

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
| `S3_REGION` | Sí | `ap-southeast-2` |
| `S3_BUCKET` | Sí | `matchinvoice` |
| `S3_ACCESS_KEY` | Sí | Access key ID de Supabase |
| `S3_SECRET_KEY` | Sí | Secret access key de Supabase |
| `S3_FORCE_PATH_STYLE` | Sí | `true` |
| `WEB_ORIGIN` | Sí | `https://matchinvoice.vercel.app` |
| `COOKIE_SAME_SITE` | No | `none` en producció |
| `COOKIE_SECURE` | No | `true` en producció |
| `COOKIE_DOMAIN` | No | Buit |
| `TRUST_PROXY` | No | `true` en producció |
| `ALLOW_PUBLIC_REGISTRATION` | No | `false` en producció (defecte). `true` reobre el registre públic |
| `REGISTRATION_INVITE_CODE` | No | Si hi és i el registre públic és off, el registre demana aquest codi |
| `OPENAI_API_KEY` | No | Clau d’OpenAI |
| `INVOICE_EXTRACTOR` | No | `auto` (per defecte), `documentai`, `openai` o `local` |
| `GOOGLE_CLOUD_PROJECT_ID` | No | Project ID de Google Cloud |
| `DOCUMENT_AI_LOCATION` | No | `eu` |
| `DOCUMENT_AI_PROCESSOR_ID` | No | ID del processador Invoice Parser |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | No | Clau JSON del compte de servei (secret) |

## Variables del web

| Variable | Obligatòria | Valor |
| --- | --- | --- |
| `API_PROXY_URL` | Recomanat | URL de Render; el panell usa `/backend/*` (galeta de primera part) |
| `NEXT_PUBLIC_API_URL` | No (evitar) | URL de Render en cross-site; no la combinis amb `API_PROXY_URL` |

En local no cal res d’això: `docker compose up -d`, `npm run dev` a l’arrel i `npm run dev` a `web/` fan servir S3 (SeaweedFS), Redis i Postgres locals.

## Abans de fer pública la instància

- `ALLOW_PUBLIC_REGISTRATION=false` (ja és el valor per defecte a producció) o registre amb `REGISTRATION_INVITE_CODE`. Amb el registre obert, qualsevol pot gastar les claus d’IA del servidor i enviar correus des del teu domini.
- Si Vercel fa servir el proxy `/backend` (`API_PROXY_URL` definit i `NEXT_PUBLIC_API_URL` buit), canvia `COOKIE_SAME_SITE` a `lax` a Render: la cookie passa a ser de primera part i queda protegida contra CSRF. Deixa `none` només si el navegador crida l’API de Render directament.
- Si actives el login amb Google, `GOOGLE_CLIENT_ID` ha d’estar definit a Render: sense, l’API rebutja els tokens de Google.
- Vulnerabilitats: vegeu [`SECURITY.md`](SECURITY.md).
