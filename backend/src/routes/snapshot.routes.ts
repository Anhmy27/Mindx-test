import { Router } from 'express'
import {
  createSnapshotHandler,
  listSnapshotsHandler,
  restartSnapshotHandler,
  snapshotItemActionHandler,
  runSnapshotHandler,
} from '../controllers/process.controller.js'

const snapshotRouter = Router()

snapshotRouter.get('/', listSnapshotsHandler)
snapshotRouter.post('/', createSnapshotHandler)
snapshotRouter.post('/:id/run', runSnapshotHandler)
snapshotRouter.post('/:id/restart', restartSnapshotHandler)
snapshotRouter.post('/:id/items/:itemIndex/action', snapshotItemActionHandler)

export default snapshotRouter
