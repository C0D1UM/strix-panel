import { schema } from '@strix-panel/db'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { db } from '../src/lib/db'
import { getSettings, updateSettings } from '../src/modules/settings/service'
import { request, signUp } from './helpers'

beforeEach(async () => {
  await db.delete(schema.setting)
  await db.delete(schema.user)
})
// Test files share one database: don't leak settings into the next file.
afterEach(async () => {
  await db.delete(schema.setting)
})

const patch = (cookie: string, body: unknown) =>
  request('/api/v1/admin/settings', {
    method: 'PATCH',
    headers: { cookie },
    body: JSON.stringify(body),
  })

describe('settings service', () => {
  test('defaults when nothing is stored', async () => {
    expect(await getSettings()).toEqual({
      auth: { registrationEnabled: true, autoApproveUsers: true },
    })
  })

  test('updates only the given keys and records who changed them', async () => {
    await signUp('first@example.com')
    const [admin] = await db.select({ id: schema.user.id }).from(schema.user)
    await updateSettings({ auth: { autoApproveUsers: false } }, admin!.id)
    const rows = await db.select().from(schema.setting)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      key: 'auth.autoApproveUsers',
      value: false,
      updatedBy: admin!.id,
    })
    expect((await getSettings()).auth).toEqual({
      registrationEnabled: true,
      autoApproveUsers: false,
    })
  })

  test('updating an existing key overwrites it', async () => {
    await updateSettings({ auth: { registrationEnabled: false } }, null)
    await updateSettings({ auth: { registrationEnabled: true } }, null)
    expect((await getSettings()).auth.registrationEnabled).toBe(true)
    expect(await db.select().from(schema.setting)).toHaveLength(1)
  })
})

describe('/api/v1/admin/settings', () => {
  test('admins only', async () => {
    await signUp('first@example.com')
    const user = await signUp('second@example.com')
    const get = await request('/api/v1/admin/settings', { headers: { cookie: user.cookie } })
    expect(get.status).toBe(403)
    expect((await patch(user.cookie, {})).status).toBe(403)
    expect((await request('/api/v1/admin/settings')).status).toBe(401)
  })

  test('PATCH then GET round-trips', async () => {
    const admin = await signUp('first@example.com')
    const patched = await patch(admin.cookie, { auth: { registrationEnabled: false } })
    const expected = { auth: { registrationEnabled: false, autoApproveUsers: true } }
    expect(patched.status).toBe(200)
    expect(await patched.json()).toEqual(expected)
    const got = await request('/api/v1/admin/settings', { headers: { cookie: admin.cookie } })
    expect(await got.json()).toEqual(expected)
  })

  test('rejects a value of the wrong type', async () => {
    const admin = await signUp('first@example.com')
    const res = await patch(admin.cookie, { auth: { registrationEnabled: 'nope' } })
    expect(res.status).toBe(422)
    expect(await db.select().from(schema.setting)).toHaveLength(0)
  })

  test('never stores unknown keys', async () => {
    const admin = await signUp('first@example.com')
    const res = await patch(admin.cookie, { auth: { nope: true }, other: { x: 1 } })
    expect(res.status).toBeLessThan(500)
    expect(await db.select().from(schema.setting)).toHaveLength(0)
  })

  test('public config follows the stored registration setting', async () => {
    await updateSettings({ auth: { registrationEnabled: false } }, null)
    const config = (await (await request('/api/v1/config')).json()) as {
      auth: { registrationEnabled: boolean }
    }
    expect(config.auth.registrationEnabled).toBe(false)
  })
})
