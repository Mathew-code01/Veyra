# Veyra database layer

This directory implements the local-first persistence layer using SQLite,
Drizzle ORM and better-sqlite3.

## Install

npm install drizzle-orm better-sqlite3
npm install -D drizzle-kit @types/better-sqlite3

## Database path

Set `VEYRA_DATABASE_PATH` to an application-data path in production.
For example:

VEYRA_DATABASE_PATH=./data/veyra.db

The database client enables WAL mode, foreign keys, a busy timeout and
transaction support.

## Important

Do not store API keys or provider credentials in these tables. Credentials
belong in the desktop secure credential store.

Do not store raw audio/video indefinitely. Capture records contain metadata
and optional storage paths so retention policies can remove temporary media.

The migrations directory must contain generated Drizzle migrations before
shipping a production build.
