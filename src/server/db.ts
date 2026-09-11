import { drizzle } from 'drizzle-orm/d1'
import { env } from 'cloudflare:workers'

type RuntimeEnv = { DB?: D1Database }

export function getDb() {
  const database = (env as unknown as RuntimeEnv).DB
  if (!database) {
    throw new Error('Database is not connected. Add the DB binding and apply the migrations.')
  }
  return drizzle(database)
}

export function getRawDb() {
  const database = (env as unknown as RuntimeEnv).DB
  if (!database) {
    throw new Error('Database is not connected. Add the DB binding and apply the migrations.')
  }
  return database
}
