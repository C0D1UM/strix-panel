import { prepareTestDatabase, testDatabaseUrl } from '@strix-panel/db/testing'

process.env.DATABASE_URL = testDatabaseUrl('worker')

await prepareTestDatabase(process.env.DATABASE_URL)
