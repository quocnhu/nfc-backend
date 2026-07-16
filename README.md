# NestJS + Prisma + Supabase Starter

A minimal NestJS API wired up to your Supabase Postgres database via Prisma, with a
`GET /` hello-world route and a `GET /health/db` route that confirms the DB connection.

## 1. Install dependencies

```bash
cd nest-prisma-app
npm install
```

## 2. Environment variables

A `.env` is already included with your Supabase credentials. **Rotate the service role
key / JWT secret in your Supabase dashboard before deploying**, since they were shared
in plain text — then update `.env` with the new values.

Key vars used by Prisma:
- `POSTGRES_PRISMA_URL` — pooled (pgbouncer) connection, used at runtime.
- `POSTGRES_URL_NON_POOLING` — direct connection, used by `prisma migrate`.

## 3. Generate the Prisma client

```bash
npm run prisma:generate
```

## 4. Sync the schema to your database

Since the `Example` model in `prisma/schema.prisma` is new, push it to Supabase:

```bash
npm run prisma:push
```

(Use `npm run prisma:migrate` instead if you want tracked migration files.)

## 5. Run the app

```bash
npm run start:dev
```

Then check:
- `http://localhost:3000/` → "Hello World! NestJS + Prisma + Supabase is running."
- `http://localhost:3000/health/db` → `{"status":"ok","message":"Connected to Supabase Postgres via Prisma"}`

## Project structure

```
src/
  main.ts              # app bootstrap
  app.module.ts         # root module (imports ConfigModule + PrismaModule)
  app.controller.ts      # routes: GET /, GET /health/db
  app.service.ts         # hello world + Prisma raw query check
  prisma/
    prisma.service.ts    # PrismaClient wrapped as a Nest injectable, connects on module init
    prisma.module.ts     # @Global module exporting PrismaService everywhere
prisma/
  schema.prisma          # datasource + generator + example model
```

## Notes on Supabase + Prisma

- Use the **pooled** connection string (port 6543, `pgbouncer=true`) for the app at
  runtime — Supabase's pooler (pgbouncer) doesn't support prepared statements well
  outside this mode, and Prisma handles it correctly when `pgbouncer=true` is set.
- Use the **direct** connection string (port 5432, no pgbouncer) for `prisma migrate`
  / `prisma db push`, since schema changes need a direct, non-pooled connection.
- Both are already wired in `prisma/schema.prisma` via `url` and `directUrl`.
