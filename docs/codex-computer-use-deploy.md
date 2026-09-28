# Runbook: desplegar MatchInvoice amb Codex (computer use)

Aquest document és per a un **agent amb accés al navegador** (Codex amb computer use). Segueix-lo en ordre, pas a pas. Cada pas té: **Obre** (URL), **Clica** (text visible del botó o etiqueta), **Escriu / Tria** (valors), **Comprova** (què ha de sortir a la pantalla) i, quan cal, **ATURA’T**.

La guia humana equivalent és [`DEPLOY.md`](../DEPLOY.md). Si la interfície d’un servei ha canviat i un botó no hi és amb aquest text exacte, busca l’equivalent més proper per significat, no inventis passos, i anota la diferència a l’informe final.

---

## Regles per a l’agent (obligatòries)

1. **Punts d’aturada.** Atura’t i demana ajuda a l’usuari (Guillem) quan aparegui qualsevol d’aquests casos. No intentis resoldre’ls tu:
   - pantalla d’inici de sessió, contrasenya d’un compte, **2FA** / codi / passkey / aplicació d’autenticació;
   - **verificació de correu** o SMS;
   - **CAPTCHA**;
   - petició de **targeta de crèdit**, dades de facturació o qualsevol **pla de pagament** (Pro, Team, Pay as You Go, Fixed, Starter, Paid…);
   - avís que el pla gratuït està esgotat o que cal pagar per continuar;
   - qualsevol pregunta de consentiment legal (termes, DPA) que no sigui només acceptar els termes estàndard en crear el compte.
   Missatge a usar: `ATURADA [servei]: <què veig>. Necessito que <acció concreta>. Digues «fet» quan acabis.`
2. **Mai acceptis un pla de pagament.** Tria sempre **Free** / **Hobby**. Si l’única opció visible és de pagament, ATURA’T.
3. **Secrets.** Són secrets: contrasenya de la base de dades, `DATABASE_URL`, `REDIS_URL`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `OPENAI_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS_JSON` (el fitxer JSON de la clau del compte de servei de Google).
   - Copia’ls amb el botó **Copy** del servei i enganxa’ls **directament** al camp de destí (Render). No els escriguis en cap altre lloc.
   - **Mai** els enganxis a: el xat amb l’usuari, l’informe final, un fitxer del repositori, un commit, un issue, un pull request, un camp de Vercel que comenci per `NEXT_PUBLIC_`, ni un formulari públic.
   - A l’informe, escriu només `[desat a Render]` en lloc del valor.
   - Si has de retenir un secret entre pestanyes i el porta-retalls no basta, ATURA’T i demana a l’usuari que el desi al seu gestor de contrasenyes.
   - `DATABASE_URL`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` i `S3_FORCE_PATH_STYLE` ja són al fitxer local `.env.production.local` (arrel del repositori; el git l’ignora). Pots llegir-lo només per enganxar els valors a Render. **Mai** n’escriguis el contingut al xat, a l’informe, al git ni a Vercel.
4. **No són secrets** (es poden mostrar a l’informe): URL de Render, domini de Vercel, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, noms de projecte, `GOOGLE_CLOUD_PROJECT_ID`, `DOCUMENT_AI_LOCATION`, `DOCUMENT_AI_PROCESSOR_ID`, correu del compte de servei.
5. **No canviïs codi** ni facis commits. Aquest runbook només crea serveis i configura variables.
6. **Regió.** Supabase ja és **Sydney / `ap-southeast-2`** (projecte `invoices`, ref `<project-ref>`). No creïs un altre projecte i no triïs Frankfurt ni `eu-central-1`. **Upstash** i **Render**: la regió més propera a Sydney que el pla gratuït ofereixi — **Sydney** si hi surt, si no **Singapore**. Escriu a l’informe quina has triat. **Vercel** es queda **global** (no triïs regió). Si ni Sydney ni Singapore són al pla Free, **ATURA’T**; no acceptis un pla de pagament ni caiguis a Europa.
7. **Nom:** `matchinvoice` per al bucket (ja existeix), Upstash, Render i Vercel. El projecte de Supabase ja es diu `invoices`; no el reanomenis ni en creïs un altre.
8. Després de cada pas, fes la **Comprova**. Si no es compleix, ves a la secció «Si falla» d’aquell servei. Si després de dos intents continua fallant, ATURA’T i explica què veus.

## Registre de valors (omple’l mentre avances)

Porta aquesta taula a l’informe final. Els secrets mai apareixen en clar.

| Clau | Valor | Secret |
| --- | --- | --- |
| Supabase project name | `invoices` | No |
| Supabase project ref | `<project-ref>` | No |
| Supabase region | Sydney, `ap-southeast-2` | No |
| Rol de connexió | `matchinvoice` (Session pooler, no `postgres`) | No |
| Contrasenya BD Supabase | `[a .env.production.local; no la mostris]` | **Sí** |
| `DATABASE_URL` | `[desat a Render des del fitxer local]` | **Sí** |
| `S3_ENDPOINT` | `[a .env.production.local; forma https://<ref>.storage.supabase.co/storage/v1/s3]` | No |
| `S3_REGION` | `ap-southeast-2` | No |
| `S3_BUCKET` | `matchinvoice` | No |
| `S3_ACCESS_KEY` | `[desat a Render]` | **Sí** |
| `S3_SECRET_KEY` | `[desat a Render]` | **Sí** |
| `REDIS_URL` | `[desat a Render]` | **Sí** |
| URL API Render | `https://…onrender.com` | No |
| Domini Vercel | `https://….vercel.app` | No |
| `GOOGLE_CLOUD_PROJECT_ID` *(opcional)* | `matchinvoice-…` | No |
| `DOCUMENT_AI_LOCATION` *(opcional)* | `eu` | No |
| `DOCUMENT_AI_PROCESSOR_ID` *(opcional)* | `<id del processador>` | No |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` *(opcional)* | `[enganxat per l’usuari a Render]` | **Sí** |

---

## Pas 1 — GitHub (comprovació)

1. **Obre** `https://github.com/guillem9988/invoices`.
2. Si demana iniciar sessió o el repositori mostra 404 → **ATURA’T** (`ATURADA GitHub: cal iniciar sessió amb el compte que té el repositori`).
3. **Comprova** que la branca seleccionada és `main` i que a la llista de fitxers hi ha: `Dockerfile`, `render.yaml`, `DEPLOY.md`, `.env.production.example` i la carpeta `web`.
4. **Comprova** que el darrer commit no té una creu vermella de CI (si no hi ha CI, és correcte).

**Si falla (GitHub):** si falten `Dockerfile` o `render.yaml`, la branca `main` no està actualitzada: ATURA’T i demana a l’usuari que faci `git push origin main`.

---

## Pas 2 — Supabase (ja creat)

No creïs un projecte, no generis una contrasenya nova i no facis **Reset database password**.

### 2.1 Comprovar el projecte

1. **Obre** `https://supabase.com/dashboard/project/<project-ref>`.
2. Si demana iniciar sessió → **Clica** **Continue with GitHub**. Si apareix login de GitHub, 2FA o verificació de correu → **ATURA’T**.
3. **Comprova**:
   - el nom del projecte és `invoices` (no en creïs un que es digui `matchinvoice`);
   - el ref de la URL és `<project-ref>`;
   - la regió és **Oceania (Sydney)** / `ap-southeast-2`, no Frankfurt ni `eu-central-1`.

### 2.2 `DATABASE_URL`

1. **Clica** el botó **Connect** de la barra superior del projecte.
2. A la finestra, busca la secció **Session pooler** (pot estar sota *Connection string* → *URI*, o com a opció del desplegable *Method*). Ha de tenir el **port 5432** i l’amfitrió `aws-0-ap-southeast-2.pooler.supabase.com`.
   - No facis servir **Direct connection** (host `db.<project-ref>.supabase.co`) ni **Transaction pooler** (port 6543).
3. **Comprova** que l’usuari de la URI és `matchinvoice.<project-ref>`, no `postgres.<project-ref>`. La forma, sense contrasenya, és `postgresql://matchinvoice.<project-ref>:[CONTRASENYA]@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres`.
4. No completis ni copiïs la contrasenya aquí. El valor sencer ja és `DATABASE_URL` a `.env.production.local`. L’enganxaràs només al camp de Render (pas 4), sense escriure’l al xat ni a l’informe.
5. Les migracions **ja estan aplicades**. No les executis a mà.

### 2.3 Bucket privat

1. Menú esquerre → **Storage**.
2. **Comprova**: el bucket `matchinvoice` ja existeix i és privat (no *Public*). No en creïs un altre. No activis *Public bucket*.

### 2.4 Claus S3 i extensions

1. A **Storage**, **Clica** **Settings** (o **S3 Configuration**; en algunes versions és a **Project Settings → Storage**).
2. **Comprova** que **S3 protocol connection** / **Enable connection via S3 protocol** està activat. Si està apagat, activa’l i **Save**. Si diu que S3 requereix un pla de pagament, ATURA’T.
3. **Comprova** que la **Region** és `ap-southeast-2` i que l’**Endpoint** acaba en `/storage/v1/s3`. No copiïs l’endpoint ni les claus a l’informe: ja són al fitxer local.
4. No creïs una clau S3 nova. `S3_ACCESS_KEY` i `S3_SECRET_KEY` ja són a `.env.production.local`. El secret d’una clau ja creada no es torna a mostrar.
5. **Database** → **Extensions**. **Comprova** que `pg_trgm` i `pgcrypto` estan activades.

### Si falla (Supabase)

- *La regió no és Sydney, el ref no coincideix o l’usuari del pooler és `postgres`*: ATURA’T. No creïs un projecte nou.
- *No trobo Session pooler*: al diàleg **Connect**, canvia la pestanya o el desplegable a *Session pooler* / *Shared pooler*. Si només hi ha *Dedicated pooler* de pagament, ATURA’T.
- *El bucket `matchinvoice` no hi és o és públic*: ATURA’T.
- *Falta `pg_trgm` o `pgcrypto`*: activa-les a **Database → Extensions**. En aquest projecte ja hi haurien de ser.
- *No trobo la configuració S3*: busca a **Project Settings → Storage** o a la cerca del panell «S3». Si diu que S3 requereix un pla de pagament, ATURA’T.

---

## Pas 3 — Upstash Redis

1. **Obre** `https://console.upstash.com`.
2. Si demana iniciar sessió → **Continue with GitHub** (o el mètode que triï l’usuari). Login, 2FA o verificació de correu → **ATURA’T**.
3. **Clica** **Redis** (menú superior o lateral) → **Create Database**.
4. **Escriu / Tria**:
   - **Name**: `matchinvoice`
   - **Primary Region**: la més propera a Sydney que el pla **Free** ofereixi. Tria **Sydney** (`ap-southeast-2`) si hi surt; si no, **Singapore** (`ap-southeast-1`). No triïs Frankfurt.
   - **Read Regions**: cap.
   - **Plan**: **Free**. Si el formulari mostra *Pay as You Go* o *Fixed* seleccionat, canvia a **Free**. Si no hi ha Free → **ATURA’T**.
   - **Eviction**: **desactivat**.
5. **Clica** **Create** (o **Next** → **Create**).
6. **Comprova**: s’obre la pàgina de la base de dades amb **Endpoint** `…upstash.io`, **Port** `6379`, **TLS** activat i el pla **Free**.
7. A la secció **Connect** / **Connect to your database**, tria la pestanya **TCP** (o **ioredis** / **Node**). Busca una URL que comenci per **`rediss://default:`**. **Clica** l’icona de **Copy** d’aquesta URL. Aquest valor és `REDIS_URL` (secret).
   - Si la URL mostra la contrasenya amb asteriscs, **Clica** l’icona d’ull o **Reveal** abans de copiar.
8. **Comprova**: el text copiat comença per `rediss://` (dues `s`) i acaba en `:6379`.

### Si falla (Upstash)

- *Només veig `redis://` sense la segona `s`*: canvia `redis://` per `rediss://` en enganxar-lo a Render (Upstash sempre usa TLS).
- *Ni Sydney ni Singapore apareixen al pla Free*: ATURA’T. No creïs la base de dades a Europa ni amb un pla de pagament.
- *Demana targeta per crear la base de dades*: ATURA’T.

---

## Pas 4 — Render (API)

### 4.1 Blueprint

1. **Obre** `https://dashboard.render.com`.
2. Si demana iniciar sessió → **GitHub**. Login, 2FA o verificació de correu → **ATURA’T**.
3. Si demana crear un *workspace*: nom `matchinvoice`, pla **Hobby** / gratuït. Si demana targeta → **ATURA’T**.
4. **Clica** **New** (o **+ New**) → **Blueprint**.
5. A **Connect a repository**: si no hi surt `guillem9988/invoices`, **Clica** **Configure account** / **Connect GitHub** i dona accés al repositori `invoices` (només aquest). Pantalla d’autorització de GitHub amb contrasenya o 2FA → **ATURA’T**.
6. **Clica** **Connect** al costat de `guillem9988/invoices`.
7. **Escriu** **Blueprint Name**: `matchinvoice`. **Branch**: `main`. **Blueprint Path**: `render.yaml` (per defecte).
8. **Comprova**: Render mostra un servei **matchinvoice-api**, tipus **Web Service**, runtime **Docker**, pla **Free**. El blueprint encara marca la regió **Frankfurt** perquè `render.yaml` té `region: frankfurt`. Abans d’aplicar, canvia la regió a la més propera a Sydney que el pla **Free** ofereixi: **Sydney** si hi surt, si no **Singapore**. Si el pla no és Free → **ATURA’T** (no l’acceptis). Si no pots canviar la regió i l’única opció és Frankfurt → **ATURA’T** (`ATURADA Render: el Blueprint força Frankfurt i no puc triar Singapore ni Sydney al pla Free.`).
9. Render mostra camps per a les variables amb `sync: false`. Omple-les des de `.env.production.local` i des d’Upstash. No escriguis cap secret al xat. Si no pots llegir el fitxer local, **ATURA’T**: `ATURADA Render: enganxa tu, des de .env.production.local, DATABASE_URL, S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY i S3_SECRET_KEY. No els enviïs al xat. DATABASE_URL ha d’usar el rol matchinvoice i l’amfitrió aws-0-ap-southeast-2.pooler.supabase.com:5432. S3_REGION ha de ser ap-southeast-2. Digues «fet».`

| Camp a Render | Què hi enganxes |
| --- | --- |
| `DATABASE_URL` | El valor de `DATABASE_URL` del fitxer local. Rol `matchinvoice`, host `aws-0-ap-southeast-2.pooler.supabase.com:5432`. No el reconstrueixis amb l’usuari `postgres`. |
| `REDIS_URL` | La URL `rediss://…` d’Upstash (pas 3.7) |
| `S3_ENDPOINT` | El valor de `S3_ENDPOINT` del fitxer local |
| `S3_REGION` | `ap-southeast-2` (el valor de `S3_REGION` del fitxer local) |
| `S3_ACCESS_KEY` | El valor de `S3_ACCESS_KEY` del fitxer local |
| `S3_SECRET_KEY` | El valor de `S3_SECRET_KEY` del fitxer local |
| `WEB_ORIGIN` | `https://matchinvoice.vercel.app` (provisional; es corregeix al pas 6) |

   Deixa **buits** `GOOGLE_CLOUD_PROJECT_ID`, `DOCUMENT_AI_PROCESSOR_ID` i `GOOGLE_APPLICATION_CREDENTIALS_JSON`: s’omplen al pas 8 (opcional). Sense ells, l’API fa servir OpenAI o el lector local.

   No modifiquis les variables que ja tenen valor (`NODE_ENV`, `DATABASE_POOL_MAX`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE`, `COOKIE_SAME_SITE`, `COOKIE_SECURE`, `BULLMQ_*`, `INVOICE_EXTRACTOR`, `DOCUMENT_AI_LOCATION`).
10. **Clica** **Apply** / **Deploy Blueprint** / **Create New Resources**.
11. Si en aquest moment demana targeta o un pla de pagament → **ATURA’T** i no acceptis.

### 4.2 Esperar el desplegament

1. **Clica** el servei **matchinvoice-api** → pestanya **Logs** (o **Events**).
2. Espera (pot trigar 5–10 minuts la primera vegada). **Comprova** als logs, en aquest ordre:
   - `No pending migrations to apply` (les migracions ja estan aplicades; `All migrations have been successfully applied` també val);
   - una o més línies `Server listening at http://…:10000` (el port pot ser un altre si Render n’assigna un de diferent);
   - `invoice processing worker started in the API process`;
   - l’estat del servei passa a **Live** (verd).
3. Anota la URL que surt a dalt del servei, sota el nom (`https://matchinvoice-api.onrender.com` o amb un sufix). És la **URL API Render**.

### 4.3 Comprovar la salut

1. **Obre** `<URL API Render>/health` en una pestanya nova.
2. **Comprova** que la resposta JSON té `"status":"ok"` i `"up"` a `postgres`, `redis` i `minio`. (`minio` vol dir l’emmagatzematge S3, que aquí és Supabase Storage.)
3. **Obre** `<URL API Render>/health/live` → **Comprova** `{"status":"ok"}`.

### Si falla (Render)

- *Logs: `P1001` / `Can't reach database server`*: `DATABASE_URL` no és el Session pooler de Sydney (`aws-0-ap-southeast-2.pooler.supabase.com:5432`) o encara té un marcador de contrasenya. Ves a **Environment** i torna a enganxar el valor del fitxer local (sense mostrar-lo) → **Save Changes**.
- *Logs: `password authentication failed`*: contrasenya incorrecta o amb símbols sense codificar. ATURA’T i demana a l’usuari que la revisi.
- *Logs: error de certificat (`self-signed certificate`) durant `prisma migrate deploy`*: a **Environment** → **Add Environment Variable** → `DIRECT_URL` = el mateix valor que `DATABASE_URL` acabat en `?sslmode=require&sslaccept=accept_invalid_certs` (demana a l’usuari que l’enganxi) → **Save Changes**.
- *Logs: `permission denied to create extension`*: en aquest projecte `pg_trgm` i `pgcrypto` ja estan activades. Comprova que `DATABASE_URL` usa el rol `matchinvoice` del Session pooler de Sydney, no `postgres`. Si falten, activa-les a Supabase → **Database** → **Extensions** i a Render fes **Manual Deploy** → **Deploy latest commit**.
- *Logs: `WEB_ORIGIN is required in production`*: afegeix `WEB_ORIGIN` a **Environment**.
- *`/health` mostra `redis: down`*: `REDIS_URL` ha de començar per `rediss://`. Corregeix-la a **Environment**.
- *`/health` mostra `minio: down` amb `SignatureDoesNotMatch`*: `S3_REGION` no és `ap-southeast-2`. Amb `NoSuchBucket`: el bucket no es diu `matchinvoice`. Amb `InvalidAccessKeyId`: no revoquis la clau que ja existeix; torna a enganxar `S3_ACCESS_KEY` i `S3_SECRET_KEY` des de `.env.production.local`. Si l’usuari confirma que no serveixen, ATURA’T abans de crear-ne una de nova.
- *El build falla per memòria o temps*: torna-ho a provar amb **Manual Deploy** → **Clear build cache & deploy**. Si torna a fallar, ATURA’T i copia (sense secrets) les darreres 30 línies del log a l’informe.
- *La primera càrrega triga ~1 minut*: és normal al pla Free (el servei dorm).

---

## Pas 5 — Vercel (panell web)

1. **Obre** `https://vercel.com/new`.
2. Si demana iniciar sessió → **Continue with GitHub**. Login, 2FA o verificació → **ATURA’T**.
3. Si demana crear un equip o triar pla: tria **Hobby** (gratuït). Si només hi ha **Pro** o demana targeta → **ATURA’T**.
4. A **Import Git Repository**, si no hi surt `invoices`, **Clica** **Adjust GitHub App Permissions** / **Configure GitHub App** i dona accés a `guillem9988/invoices`. Autorització amb contrasenya o 2FA → **ATURA’T**.
5. **Clica** **Import** al costat de `invoices`.
6. A **Configure Project**:
   - **Project Name**: `matchinvoice`
   - **Framework Preset**: **Next.js** (si no ho detecta sol, tria’l).
   - **Root Directory**: **Clica** **Edit** → tria la carpeta **`web`** → **Continue**.
   - **Build and Output Settings**: no toquis res.
   - No triïs regió: Vercel es queda **global**.
   - **Environment Variables**: **Key** `NEXT_PUBLIC_API_URL`, **Value** = la URL API Render del pas 4.2 (sense barra final) → **Add**.
     Aquest valor **no** és secret i és l’únic que va a Vercel. Cap secret de Supabase, Upstash ni OpenAI va a Vercel.
7. **Clica** **Deploy**.
8. **Comprova**: la pantalla mostra *Congratulations* / confeti i una vista prèvia del panell. **Clica** **Continue to Dashboard** i anota el domini de **Production** (per exemple `https://matchinvoice.vercel.app` o `https://matchinvoice-<sufix>.vercel.app`). És el **Domini Vercel**.

### Si falla (Vercel)

- *Build: `Couldn't find any pages or app directory`*: el **Root Directory** no és `web`. **Settings** → **Build and Deployment** → **Root Directory** = `web` → **Save** → **Deployments** → **Redeploy**.
- *Build falla amb errors de TypeScript*: ATURA’T i copia l’error a l’informe (el repositori hauria de compilar; és un problema de codi).
- *Has oblidat `NEXT_PUBLIC_API_URL`*: **Settings** → **Environment Variables** → afegeix-la per a **Production** → **Deployments** → menú **⋯** del darrer deploy → **Redeploy**. Cal redeploy perquè s’incrusta en compilar.

---

## Pas 6 — Tornar a Render: `WEB_ORIGIN`

1. **Obre** `https://dashboard.render.com` → **matchinvoice-api** → **Environment**.
2. **Clica** **Edit** a `WEB_ORIGIN` i posa-hi el **Domini Vercel** exacte, amb `https://`, **sense** barra final ni camí. Exemple: `https://matchinvoice.vercel.app`.
3. **Clica** **Save Changes** (si pregunta, tria **Save, rebuild, and deploy** o **Save and deploy**).
4. **Comprova**: als **Events** apareix un deploy nou que acaba en **Live**.

**Si falla:** si el deploy no arrenca sol, **Manual Deploy** → **Deploy latest commit**.

---

## Pas 7 — Verificació final

1. **Obre** `<URL API Render>/health`. **Comprova** `"status":"ok"` i `postgres`, `redis`, `minio` a `"up"`. Si triga, espera 60 segons i recarrega (Render desperta el servei).
2. **Obre** el **Domini Vercel**. **Comprova** que surt la pantalla **Entra al teu compte** amb el logotip **MI** i el text **MatchInvoice**.
3. **Clica** la pestanya **Registra’t**. **Escriu**:
   - **El teu nom**: `Prova Deploy`
   - **Correu**: `prova+deploy@example.com` (o el que indiqui l’usuari)
   - **Contrasenya**: genera’n una de 16 caràcters aleatoris; no la mostris a l’informe (escriu `[contrasenya de prova, no desada]`).
   - **Raó social**: `Prova Deploy SL`
   - **NIF / CIF**: `B00000000`
4. **Clica** **Crea el compte**. **Comprova**: apareix el toast **Compte creat. Benvingut a MatchInvoice.** i la pàgina **Inici** amb les targetes **Ingressos**, **Despeses**, **Benefici** i **Què cal fer**.
5. **Recarrega** la pàgina (F5 / Cmd+R). **Comprova** que continues a **Inici** (la galeta de sessió funciona).
6. A baix de la barra lateral, **Clica** la icona **Tanca la sessió**. **Comprova** que tornes a **Entra al teu compte**.
7. **Escriu** el mateix correu i contrasenya → **Clica** **Entra**. **Comprova** que tornes a **Inici**.
8. *(Opcional)* Obre **Contactes** → **Nou contacte** → crea un client de prova. **Comprova** el toast verd.

### Si falla (verificació)

- *Toast «No hi ha connexió amb el servidor»*: el servei de Render dormia o `NEXT_PUBLIC_API_URL` és incorrecta. Espera 60 s i torna-ho a provar. Si continua, revisa el pas 5.6.
- *Error de CORS a la consola del navegador*: `WEB_ORIGIN` a Render no coincideix exactament amb el Domini Vercel (pas 6).
- *El registre funciona però en recarregar tornes al login* (típic de Safari, o de Chrome amb galetes de tercers bloquejades): activa el mode proxy:
  1. Vercel → **Settings** → **Environment Variables**: esborra `NEXT_PUBLIC_API_URL` i afegeix `API_PROXY_URL` = URL API Render.
  2. **Deployments** → **⋯** → **Redeploy**.
  3. Torna a fer els passos 7.2–7.7.
- *«Aquest correu ja té un compte»*: el registre ja s’havia fet; ves directament al pas 7.7.

---

## Pas 8 — *(Opcional)* Google Document AI (lector de factures)

Document AI llegeix PDF i fotos de factures amb el processador **Invoice Parser** de Google. És opcional: sense aquest pas, l’API fa servir OpenAI (si hi ha `OPENAI_API_KEY`) o el lector local + Tesseract.

> **Document AI exigeix un compte de facturació (billing) de Google Cloud amb targeta**, encara que facis servir crèdit gratuït. Es cobra per pàgina processada. Tu **no** crees ni vincules mai el compte de facturació: és un punt d’aturada obligatori (regla 1). Si l’usuari no el vol activar, salta aquest pas sencer.

### 8.1 Projecte

1. **Obre** `https://console.cloud.google.com`.
2. Pantalla d’inici de sessió de Google, 2FA, passkey o verificació → **ATURA’T** (`ATURADA Google Cloud: cal iniciar sessió amb el compte de Google de l’usuari`).
3. Si és el primer cop i demana acceptar els **Terms of Service** i triar país: país **Spain**, accepta només els termes estàndard. Si demana dades de facturació o targeta → **ATURA’T** (vegeu 8.2).
4. **Clica** el selector de projecte (barra superior, al costat del logotip) → **New project**.
5. **Escriu** **Project name**: `matchinvoice`. **Organization / Location**: deixa el valor per defecte (*No organization* en un compte personal).
6. **Clica** **Create**. Espera la notificació i selecciona el projecte `matchinvoice`.
7. **Comprova**: a **Dashboard** / **Project info** surt el **Project ID** (per exemple `matchinvoice` o `matchinvoice-123456`). Anota’l com a `GOOGLE_CLOUD_PROJECT_ID` (no és secret). Fes servir el **Project ID**, no el *Project number*.

### 8.2 Facturació — ATURADA OBLIGATÒRIA

1. **Obre** `https://console.cloud.google.com/billing/linkedaccount?project=<GOOGLE_CLOUD_PROJECT_ID>`.
2. Sigui el que sigui el que vegis (*Link a billing account*, *Create billing account*, *Start free trial*, formulari de targeta), **ATURA’T**:
   `ATURADA Google Cloud: Document AI necessita un compte de facturació vinculat al projecte matchinvoice. Crea’l o vincula’l tu (targeta, dades fiscals) i, si vols, posa un pressupost amb alertes a Billing → Budgets & alerts. Digues «fet» quan el projecte tingui facturació, o «salta» per no fer servir Document AI.`
3. Si l’usuari diu «salta», ves directament a l’informe final i marca Document AI com a *no configurat*.
4. **Comprova** (després de «fet»): la pàgina de facturació del projecte mostra un compte de facturació vinculat.

### 8.3 Activar l’API

1. **Obre** `https://console.cloud.google.com/apis/library/documentai.googleapis.com?project=<GOOGLE_CLOUD_PROJECT_ID>`.
2. **Clica** **Enable**.
3. **Comprova**: la pàgina passa a **API Enabled** / mostra **Manage**. Si diu que cal facturació → torna a 8.2.

### 8.4 Processador Invoice Parser a `eu`

1. **Obre** `https://console.cloud.google.com/ai/document-ai/processor-library?project=<GOOGLE_CLOUD_PROJECT_ID>`.
2. Busca **Invoice Parser** → **Clica** **Create processor**.
3. **Escriu / Tria**:
   - **Processor name**: `matchinvoice-invoices`
   - **Region**: **EU (European Union)** (`eu`). **No** triïs `US`.
4. **Clica** **Create**.
5. **Comprova**: s’obre la pàgina **Processor details** amb **Region** `eu`. Copia el camp **ID** (una cadena hexadecimal curta, per exemple `a1b2c3d4e5f6a7b8`) com a `DOCUMENT_AI_PROCESSOR_ID` (no és secret). El **Prediction endpoint** ha de començar per `https://eu-documentai.googleapis.com/`.

### 8.5 Compte de servei i clau JSON

1. **Obre** `https://console.cloud.google.com/iam-admin/serviceaccounts?project=<GOOGLE_CLOUD_PROJECT_ID>`.
2. **Clica** **Create service account**.
3. **Escriu** **Service account name**: `matchinvoice-docai` → **Create and continue**.
4. **Grant this service account access to project** → **Select a role** → escriu `Document AI API User` → tria **Document AI API User** (`roles/documentai.apiUser`). No afegeixis cap altre rol (ni *Owner* ni *Editor*) → **Continue** → **Done**.
5. **Clica** el compte `matchinvoice-docai@<project-id>.iam.gserviceaccount.com` → pestanya **Keys** → **Add key** → **Create new key** → **JSON** → **Create**.
6. El navegador descarrega un fitxer `.json`. És **secret**. **No** l’obris, no el llegeixis en veu alta, no en copiïs el contingut.
7. **ATURA’T**:
   `ATURADA Google Cloud: s’ha descarregat la clau JSON del compte de servei matchinvoice-docai. Obre Render → matchinvoice-api → Environment → GOOGLE_APPLICATION_CREDENTIALS_JSON i enganxa-hi el contingut sencer del fitxer (pot anar en diverses línies; si el camp no ho accepta, a Terminal: jq -c . ~/Downloads/<fitxer>.json | pbcopy). Desa el fitxer al gestor de contrasenyes i esborra’l de Descàrregues. Digues «fet».`

### 8.6 Variables a Render

1. **Obre** `https://dashboard.render.com` → **matchinvoice-api** → **Environment**.
2. Omple (o edita) aquestes variables:

| Variable | Valor | Qui l’enganxa |
| --- | --- | --- |
| `GOOGLE_CLOUD_PROJECT_ID` | Project ID del pas 8.1 | Tu |
| `DOCUMENT_AI_LOCATION` | `eu` (ja ve de `render.yaml`) | — |
| `DOCUMENT_AI_PROCESSOR_ID` | ID del processador del pas 8.4 | Tu |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | Contingut del fitxer JSON | **L’usuari** (pas 8.5.7) |
| `INVOICE_EXTRACTOR` | `auto` (ja ve de `render.yaml`) | — |

3. **Clica** **Save Changes** → Render redesplega.
4. **Comprova** als **Logs** que l’API arrenca (`Server listening`). Si surt `GOOGLE_APPLICATION_CREDENTIALS_JSON must …`, el JSON enganxat no és complet: ATURA’T i demana a l’usuari que el torni a enganxar.
5. **Comprova** al panell web: **Despeses** → puja un PDF o una foto de factura → ha de passar a **Analitzada**. Si falla, l’error de la factura indica quin proveïdor ha fallat (`Document AI: …`).

### Si falla (Google Cloud)

- *`PERMISSION_DENIED` … `billing`*: el projecte no té facturació vinculada → pas 8.2 (ATURADA).
- *`PERMISSION_DENIED` … `documentai.processors.processWithVersion`*: al compte de servei li falta el rol **Document AI API User** → **IAM** → edita el compte → afegeix el rol.
- *`NOT_FOUND` del processador*: `DOCUMENT_AI_PROCESSOR_ID` o `GOOGLE_CLOUD_PROJECT_ID` incorrectes, o el processador no és a `eu`.
- *`SERVICE_DISABLED`*: l’API no està activada → pas 8.3.
- *No es pot crear la clau (`iam.disableServiceAccountKeyCreation`)*: una política d’organització ho bloqueja. ATURA’T i explica-ho a l’usuari; cal que un administrador de l’organització la desactivi per a aquest projecte.
- Si Document AI falla, les factures no es perden: l’API prova OpenAI o el lector local, i si cap no pot llegir-la la factura queda **Error** sense aturar la cua.

---

## Informe final (plantilla)

Retorna a l’usuari exactament això, sense cap secret:

```
Desplegament MatchInvoice
- GitHub: main amb Dockerfile i render.yaml ✔/✘
- Supabase: projecte invoices (ref <project-ref>, Sydney ap-southeast-2, rol matchinvoice), bucket matchinvoice privat, extensions pg_trgm i pgcrypto, migracions ja aplicades ✔/✘
- Upstash: base de dades matchinvoice (Free, Sydney o Singapore — la més propera a Sydney) ✔/✘
- Render: matchinvoice-api (Free, Sydney o Singapore — no Frankfurt) a <URL API Render> ✔/✘ — /health: <status, postgres, redis, minio>
- Vercel: matchinvoice (Hobby) a <Domini Vercel> ✔/✘ — mode A (NEXT_PUBLIC_API_URL) o mode B (API_PROXY_URL)
- Verificació: registre ✔/✘, recàrrega amb sessió ✔/✘, logout ✔/✘, login ✔/✘
- Google Document AI (opcional): projecte <project-id>, processador Invoice Parser <id> a eu, compte de servei matchinvoice-docai ✔/✘/saltat — facturació activada per l’usuari ✔/✘
- Secrets: desats només a Render (DATABASE_URL, REDIS_URL, S3_ACCESS_KEY, S3_SECRET_KEY, GOOGLE_APPLICATION_CREDENTIALS_JSON si s’ha fet el pas 8)
- Aturades: <llista de punts on has necessitat l’usuari>
- Diferències d’interfície respecte al runbook: <si n’hi ha>
```
