import "dotenv/config";
import { defineConfig } from "prisma/config";

const LOCAL_DATABASE_URL =
  "postgresql://matchinvoice:matchinvoice@localhost:54329/matchinvoice";

// Migrations need a session connection. On Supabase that is the session pooler (port 5432);
// DIRECT_URL is only needed when DATABASE_URL points at something else.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim() || LOCAL_DATABASE_URL,
  },
});
