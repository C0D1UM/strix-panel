import { prepareTestDatabase, testDatabaseUrl } from '../src/testing'

process.env.DATABASE_URL = testDatabaseUrl('db')

await prepareTestDatabase(process.env.DATABASE_URL)
