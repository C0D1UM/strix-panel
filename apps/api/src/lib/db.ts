import { createDb } from '@strix-panel/db'
import { env } from './env'

export const { db, pool } = createDb(env.DATABASE_URL)
