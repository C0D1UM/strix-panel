import { devDatabaseUrl } from './index'
import { migrateAll } from './migrate-all'

const url =
  process.env.DATABASE_URL ||
  (process.env.NODE_ENV === 'production' ? undefined : devDatabaseUrl(process.env.DB_PORT || 5432))
if (!url) {
  console.error('DATABASE_URL is required in production')
  process.exit(1)
}

await migrateAll(url)
console.log('Migrations applied')
