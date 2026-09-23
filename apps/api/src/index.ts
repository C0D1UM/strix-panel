import { app } from './app'
import { env } from './lib/env'

app.listen(env.API_PORT)
console.log(`API listening on http://localhost:${env.API_PORT} (docs at /api/docs)`)
