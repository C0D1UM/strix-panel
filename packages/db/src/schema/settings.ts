import { jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { updatedAt } from './columns'

// Panel settings changed at runtime on Admin → Settings. Keys and defaults live in
// @strix-panel/shared/settings; a missing row means the default.
export const setting = pgTable('setting', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: updatedAt(),
  updatedBy: uuid('updated_by').references(() => user.id, { onDelete: 'set null' }),
})
