import { prepareTestDatabase, testDatabaseUrl } from '@strix-panel/db/testing'

// Tests always run against a dedicated database, never the dev one. Override the base with TEST_DATABASE_URL.
process.env.DATABASE_URL = testDatabaseUrl('api')
process.env.NODE_ENV = 'test'
process.env.BETTER_AUTH_URL = 'http://localhost:5173'
process.env.BETTER_AUTH_SECRET = 'test-secret-test-secret-test-secret-000'
process.env.AUTH_GOOGLE_ENABLED = 'false'
process.env.AUTH_EMAIL_PASSWORD_ENABLED = 'true'
process.env.ALLOWED_EMAIL_DOMAINS = 'example.com'

await prepareTestDatabase(process.env.DATABASE_URL)
