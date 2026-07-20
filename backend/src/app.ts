import cors from 'cors'
import express from 'express'
import processRouter from './routes/process.routes.js'
import snapshotRouter from './routes/snapshot.routes.js'

const app = express()

app.use(cors({ origin: 'http://localhost:5173' }))
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use('/api/processes', processRouter)
app.use('/api/snapshots', snapshotRouter)

export default app
