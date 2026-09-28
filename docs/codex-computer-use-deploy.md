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
3. **Secrets.** Són secrets: contrasenya de la base de dades, `DATABASE_URL`, `REDIS_URL`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `OPENAI_API_KEY`.
   - Copia’ls amb el botó **Copy** del servei i enganxa’ls **directament** al camp de destí (Render). No els escriguis en cap altre lloc.
   - **Mai** els enganxis a: el xat amb l’usuari, l’informe final, un fitxer del repositori, un commit, un issue, un pull request, un camp de Vercel que comenci per `NEXT_PUBLIC_`, ni un formulari públic.
   - A l’informe, escriu només `[desat a Render]` en lloc del valor.
   - Si has de retenir un secret entre pestanyes i el porta-retalls no basta, ATURA’T i demana a l’usuari que el desi al seu gestor de contrasenyes.
4. **No són secrets** (es poden mostrar a l’informe): URL de Render, domini de Vercel, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, noms de projecte.
5. **No canviïs codi** ni facis commits. Aquest runbook només crea serveis i configura variables.
6. **Regió:** sempre **Frankfurt / `eu-central-1`** (és l’única regió europea de Render; tot junt redueix latència).
7. **Nom:** `matchinvoice` a tot arreu on es demani un nom.
8. Després de cada pas, fes la **Comprova**. Si no es compleix, ves a la secció «Si falla» d’aquell servei. Si després de dos intents continua fallant, ATURA’T i explica què veus.

## Registre de valors (omple’l mentre avances)

Porta aquesta taula a l’informe final. Els secrets mai apareixen en clar.

| Clau | Valor | Secret |
| --- | --- | --- |
| Supabase project ref | `<ref>` | No |
| Contrasenya BD Supabase | `[desada per l’usuari]` | **Sí** |
| `DATABASE_URL` | `[desat a Render]` | **Sí** |
| `S3_ENDPOINT` | `https://<ref>.storage.supabase.co/storage/v1/s3` | No |
| `S3_REGION` | `eu-central-1` | No |
| `S3_BUCKET` | `matchinvoice` | No |
| `S3_ACCESS_KEY` | `[desat a Render]` | **Sí** |
| `S3_SECRET_KEY` | `[desat a Render]` | **Sí** |
| `REDIS_URL` | `[desat a Render]` | **Sí** |
| URL API Render | `https://…onrender.com` | No |
| Domini Vercel | `https://….vercel.app` | No |

---

## Pas 1 — GitHub (comprovació)

1. **Obre** `https://github.com/guillem9988/invoices`.
2. Si demana iniciar sessió o el repositori mostra 404 → **ATURA’T** (`ATURADA GitHub: cal iniciar sessió amb el compte que té el repositori`).
3. **Comprova** que la branca seleccionada és `main` i que a la llista de fitxers hi ha: `Dockerfile`, `render.yaml`, `DEPLOY.md`, `.env.production.example` i la carpeta `web`.
4. **Comprova** que el darrer commit no té una creu vermella de CI (si no hi ha CI, és correcte).

**Si falla (GitHub):** si falten `Dockerfile` o `render.yaml`, la branca `main` no està actualitzada: ATURA’T i demana a l’usuari que faci `git push origin main`.

---

## Pas 2 — Supabase

### 2.1 Compte i projecte

1. **Obre** `https://supabase.com/dashboard`.
2. Si demana iniciar sessió → **Clica** **Continue with GitHub**. Si apareix login de GitHub, 2FA o verificació de correu → **ATURA’T**.
3. Si apareix un formulari de nova organització: **Name** `matchinvoice`, **Type** `Personal`, **Plan** **Free** → **Create organization**. Si el pla per defecte no és Free, canvia’l a Free; si no hi ha Free → ATURA’T.
4. **Clica** **New project**.
5. **Tria / Escriu**:
   - **Organization**: la creada o l’existent (pla Free).
   - **Project name**: `matchinvoice`
   - **Database Password**: **Clica** **Generate a password** i després el botó de **Copy** del camp.
   - **Region**: **Central EU (Frankfurt)** (`eu-central-1`).
   - Deixa la resta per defecte. Si hi ha una opció de mida de computació (*Compute size*), deixa la gratuïta (*Nano* / *Micro* dins del pla Free).
6. **ATURA’T** abans de continuar: `ATURADA Supabase: acabo de generar la contrasenya de la base de dades i és al porta-retalls. Desa-la al teu gestor de contrasenyes ara. Digues «fet».` (És l’únic moment en què es pot veure.)
7. **Clica** **Create new project**.
8. **Comprova**: apareix el panell del projecte i, al cap d’uns minuts, desapareix l’estat *Setting up project* / *Coming up*. Anota el **project ref** (la part `xxxxxxxx` de la URL `supabase.com/dashboard/project/xxxxxxxx`).

### 2.2 `DATABASE_URL`

1. **Clica** el botó **Connect** de la barra superior del projecte.
2. A la finestra, busca la secció **Session pooler** (pot estar sota *Connection string* → *URI*, o com a opció del desplegable *Method*). Ha de tenir el **port 5432** i un host `aws-0-eu-central-1.pooler.supabase.com`.
   - No facis servir **Direct connection** (host `db.<ref>.supabase.co`) ni **Transaction pooler** (port 6543).
3. **Clica** **Copy** a la URI del Session pooler. Té la forma `postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`.
4. La URI té el text `[YOUR-PASSWORD]`. **No** la completis aquí. La completaràs directament al camp de Render (pas 4) amb la contrasenya que l’usuari té desada; allà demanaràs a l’usuari que enganxi la contrasenya (vegeu 4.1).
5. **Comprova**: la URI copiada conté `pooler.supabase.com:5432`.

### 2.3 Bucket privat

1. Menú esquerre → **Storage**.
2. **Clica** **New bucket**.
3. **Escriu** **Name**: `matchinvoice`. **Public bucket**: **desactivat** (interruptor apagat). No activis restriccions de mida ni de tipus MIME.
4. **Clica** **Create bucket** (o **Save**).
5. **Comprova**: `matchinvoice` apareix a la llista de buckets amb una etiqueta o icona de privat (no *Public*).

### 2.4 Claus S3

1. A **Storage**, **Clica** **Settings** (o **S3 Configuration**; en algunes versions és a **Project Settings → Storage**).
2. **Comprova** que **S3 protocol connection** / **Enable connection via S3 protocol** està activat. Si està apagat, activa’l i **Save**.
3. A **S3 Connection** llegeix:
   - **Endpoint** → anota’l com a `S3_ENDPOINT` (no és secret). Ha d’acabar en `/storage/v1/s3`.
   - **Region** → anota-la com a `S3_REGION` (esperat `eu-central-1`).
4. A **S3 Access Keys** → **Clica** **New access key** → **Description**: `matchinvoice-api` → **Create access key**.
5. Apareixen **Access key ID** i **Secret access key**. El secret **només es mostra ara**. No tanquis aquest diàleg encara: obre Render en una pestanya nova (pas 4) i enganxa’ls allà directament. Si no pots mantenir el diàleg obert, **ATURA’T** i demana a l’usuari que desi els dos valors al gestor de contrasenyes.
6. **Comprova**: la llista **S3 Access Keys** mostra `matchinvoice-api`.

### Si falla (Supabase)

- *No puc triar Frankfurt*: tria **West EU (Paris)** (`eu-west-3`) o **West EU (Ireland)** (`eu-west-1`) i anota-ho; després `S3_REGION` serà aquesta regió.
- *El projecte no acaba de crear-se en 10 minuts*: recarrega la pàgina. Si mostra error, ATURA’T.
- *No trobo Session pooler*: al diàleg **Connect**, canvia la pestanya o el desplegable a *Session pooler* / *Shared pooler*. Si només hi ha *Dedicated pooler* de pagament, ATURA’T.
- *No trobo S3 Access Keys*: busca a **Project Settings → Storage** o a la cerca del panell «S3». Si diu que S3 requereix un pla de pagament, ATURA’T.
- *He tancat el diàleg sense copiar el secret S3*: elimina la clau (menú **⋯** → **Revoke / Delete**) i crea’n una de nova.

---

## Pas 3 — Upstash Redis

1. **Obre** `https://console.upstash.com`.
2. Si demana iniciar sessió → **Continue with GitHub** (o el mètode que triï l’usuari). Login, 2FA o verificació de correu → **ATURA’T**.
3. **Clica** **Redis** (menú superior o lateral) → **Create Database**.
4. **Escriu / Tria**:
   - **Name**: `matchinvoice`
   - **Primary Region**: **eu-central-1 (Frankfurt)** (proveïdor AWS).
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
- *Frankfurt no apareix*: tria **eu-west-1 (Ireland)** i anota-ho.
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
8. **Comprova**: Render mostra un servei **matchinvoice-api**, tipus **Web Service**, runtime **Docker**, pla **Free**, regió **Frankfurt**. Si el pla no és Free → **ATURA’T** (no l’acceptis).
9. Render mostra camps per a les variables amb `sync: false`. Omple-les:

| Camp a Render | Què hi enganxes |
| --- | --- |
| `DATABASE_URL` | La URI del Session pooler (pas 2.2). Enganxa-la i **ATURA’T**: `ATURADA Render: he enganxat la URL de Supabase a DATABASE_URL. Substitueix-hi [YOUR-PASSWORD] per la contrasenya de la base de dades (sense claudàtors; si té símbols, @→%40, #→%23, /→%2F). Digues «fet».` |
| `REDIS_URL` | La URL `rediss://…` d’Upstash (pas 3.7) |
| `S3_ENDPOINT` | Endpoint de Supabase Storage (pas 2.4.3) |
| `S3_REGION` | Regió de Supabase Storage (pas 2.4.3) |
| `S3_ACCESS_KEY` | Access key ID (pas 2.4.5) |
| `S3_SECRET_KEY` | Secret access key (pas 2.4.5) |
| `WEB_ORIGIN` | `https://matchinvoice.vercel.app` (provisional; es corregeix al pas 6) |

   No modifiquis les variables que ja tenen valor (`NODE_ENV`, `DATABASE_POOL_MAX`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE`, `COOKIE_SAME_SITE`, `COOKIE_SECURE`, `BULLMQ_*`).
10. **Clica** **Apply** / **Deploy Blueprint** / **Create New Resources**.
11. Si en aquest moment demana targeta o un pla de pagament → **ATURA’T** i no acceptis.

### 4.2 Esperar el desplegament

1. **Clica** el servei **matchinvoice-api** → pestanya **Logs** (o **Events**).
2. Espera (pot trigar 5–10 minuts la primera vegada). **Comprova** als logs, en aquest ordre:
   - `Applying migration` … i `All migrations have been successfully applied` (o `No pending migrations to apply`);
   - una o més línies `Server listening at http://…:10000` (el port pot ser un altre si Render n’assigna un de diferent);
   - `invoice processing worker started in the API process`;
   - l’estat del servei passa a **Live** (verd).
3. Anota la URL que surt a dalt del servei, sota el nom (`https://matchinvoice-api.onrender.com` o amb un sufix). És la **URL API Render**.

### 4.3 Comprovar la salut

1. **Obre** `<URL API Render>/health` en una pestanya nova.
2. **Comprova** que la resposta JSON té `"status":"ok"` i `"up"` a `postgres`, `redis` i `minio`. (`minio` vol dir l’emmagatzematge S3, que aquí és Supabase Storage.)
3. **Obre** `<URL API Render>/health/live` → **Comprova** `{"status":"ok"}`.

### Si falla (Render)

- *Logs: `P1001` / `Can't reach database server`*: `DATABASE_URL` no és el Session pooler (5432) o té `[YOUR-PASSWORD]`. Ves a **Environment**, corregeix-la (demana a l’usuari la contrasenya com al pas 4.1) → **Save Changes**.
- *Logs: `password authentication failed`*: contrasenya incorrecta o amb símbols sense codificar. ATURA’T i demana a l’usuari que la revisi.
- *Logs: error de certificat (`self-signed certificate`) durant `prisma migrate deploy`*: a **Environment** → **Add Environment Variable** → `DIRECT_URL` = el mateix valor que `DATABASE_URL` acabat en `?sslmode=require&sslaccept=accept_invalid_certs` (demana a l’usuari que l’enganxi) → **Save Changes**.
- *Logs: `permission denied to create extension`*: Supabase → **Database** → **Extensions** → activa `pg_trgm` i `pgcrypto` → a Render, **Manual Deploy** → **Deploy latest commit**.
- *Logs: `WEB_ORIGIN is required in production`*: afegeix `WEB_ORIGIN` a **Environment**.
- *`/health` mostra `redis: down`*: `REDIS_URL` ha de començar per `rediss://`. Corregeix-la a **Environment**.
- *`/health` mostra `minio: down` amb `SignatureDoesNotMatch`*: `S3_REGION` no coincideix amb la de Supabase. Amb `NoSuchBucket`: el bucket no es diu `matchinvoice`. Amb `InvalidAccessKeyId`: torna a crear la clau S3 (pas 2.4).
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

## Informe final (plantilla)

Retorna a l’usuari exactament això, sense cap secret:

```
Desplegament MatchInvoice
- GitHub: main amb Dockerfile i render.yaml ✔/✘
- Supabase: projecte matchinvoice (ref <ref>, regió <regió>), bucket matchinvoice privat, clau S3 matchinvoice-api ✔/✘
- Upstash: base de dades matchinvoice (Free, <regió>) ✔/✘
- Render: matchinvoice-api (Free, Frankfurt) a <URL API Render> ✔/✘ — /health: <status, postgres, redis, minio>
- Vercel: matchinvoice (Hobby) a <Domini Vercel> ✔/✘ — mode A (NEXT_PUBLIC_API_URL) o mode B (API_PROXY_URL)
- Verificació: registre ✔/✘, recàrrega amb sessió ✔/✘, logout ✔/✘, login ✔/✘
- Secrets: desats només a Render (DATABASE_URL, REDIS_URL, S3_ACCESS_KEY, S3_SECRET_KEY)
- Aturades: <llista de punts on has necessitat l’usuari>
- Diferències d’interfície respecte al runbook: <si n’hi ha>
```
