import { afterAll } from 'bun:test'
import { scanQueue } from '../src/lib/queue'
import { scanListener } from '../src/lib/scan-listener'

// All test files share one process and these singletons, so close them once after every file has run.
// Closing them in a file's own afterAll hangs whichever file runs next.
afterAll(async () => {
  await scanListener.close()
  await scanQueue.close()
})
