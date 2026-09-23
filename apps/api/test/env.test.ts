import { devDatabaseUrl } from '@strix-panel/db'
import { describe, expect, test } from 'bun:test'
import { loadEnv } from '../src/lib/env'

describe('loadEnv', () => {
  test('development runs with no variables set', () => {
    const env = loadEnv({})
    expect(env.DATABASE_URL).toBe(devDatabaseUrl(5432))
    expect(env.BETTER_AUTH_URL).toBe('http://localhost:5173')
    expect(env.AUTH_EMAIL_PASSWORD_ENABLED).toBe(true)
    expect(env.AUTH_GOOGLE_ENABLED).toBe(false)
  })

  test('BETTER_AUTH_URL follows WEB_PORT unless set explicitly', () => {
    expect(loadEnv({ WEB_PORT: '18102' }).BETTER_AUTH_URL).toBe('http://localhost:18102')
    expect(loadEnv({ WEB_PORT: '18102', BETTER_AUTH_URL: 'http://x.test' }).BETTER_AUTH_URL).toBe(
      'http://x.test',
    )
  })

  test('empty values in .env fall back to the defaults', () => {
    expect(loadEnv({ BETTER_AUTH_SECRET: '', DATABASE_URL: '' }).DATABASE_URL).toBe(
      devDatabaseUrl(5432),
    )
  })

  test('DATABASE_URL follows DB_PORT unless set explicitly', () => {
    expect(loadEnv({ DB_PORT: '15432' }).DATABASE_URL).toBe(
      'postgres://strix:strix@localhost:15432/strix_panel',
    )
    expect(loadEnv({ DB_PORT: '15432', DATABASE_URL: 'postgres://x/y' }).DATABASE_URL).toBe(
      'postgres://x/y',
    )
  })

  test('production has no defaults for secrets, database or public URL', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL/)
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow(/BETTER_AUTH_SECRET/)

    const base = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://db/prod',
      BETTER_AUTH_SECRET: 'x'.repeat(32),
      GOOGLE_CLIENT_ID: 'id',
      GOOGLE_CLIENT_SECRET: 'secret',
    }
    expect(() => loadEnv(base)).toThrow(/BETTER_AUTH_URL is required in production/)

    const env = loadEnv({ ...base, BETTER_AUTH_URL: 'https://panel.example.com' })
    expect(env.AUTH_GOOGLE_ENABLED).toBe(true)
    expect(env.AUTH_EMAIL_PASSWORD_ENABLED).toBe(false)
  })

  test('production with Google on requires its credentials', () => {
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://db/prod',
        BETTER_AUTH_SECRET: 'x'.repeat(32),
        BETTER_AUTH_URL: 'https://panel.example.com',
      }),
    ).toThrow(/GOOGLE_CLIENT_ID/)
  })
})
