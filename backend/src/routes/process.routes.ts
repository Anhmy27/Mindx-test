import { Router } from 'express'
import {
  getProcesses,
  killMultiple,
  killSingleProcess,
  stopContainer,
} from '../controllers/process.controller.js'

const processRouter = Router()

processRouter.get('/', getProcesses)
processRouter.post('/kill', killSingleProcess)
processRouter.post('/kill-multiple', killMultiple)
processRouter.post('/stop-container', stopContainer)

export default processRouter
