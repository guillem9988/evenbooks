# MatchInvoice API image for Render (or any Docker host).
# On start it applies pending Prisma migrations, then runs the Fastify API. The BullMQ
# invoice worker starts inside the same process (see src/server.ts), so one service is enough.

FROM node:22-bookworm-slim

# openssl: Prisma's schema engine. ca-certificates: TLS to Supabase, Upstash, and OpenAI.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dev dependencies stay installed: the API runs TypeScript through tsx and migrates with the Prisma CLI.
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production \
  HOST=0.0.0.0 \
  PORT=10000

EXPOSE 10000

CMD ["sh", "-c", "npx prisma migrate deploy && exec node --import tsx src/server.ts"]
