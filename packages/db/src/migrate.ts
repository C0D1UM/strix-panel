import { migrateAll } from './migrate-all'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

await migrateAll(url)
console.log('Migrations applied')
