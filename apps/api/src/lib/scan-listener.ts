import { createScanListener } from '@strix-panel/db/notify'
import { env } from './env'

// One LISTEN connection per API process, shared by every open scan stream.
export const scanListener = createScanListener(env.DATABASE_URL)
