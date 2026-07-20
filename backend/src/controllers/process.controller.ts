import type { Request, Response } from 'express'
import type {
  CreateSnapshotPayload,
  KillMultiplePayload,
  KillSinglePayload,
  SnapshotItemActionPayload,
  StopContainerPayload,
} from '../types/process.js'
import {
  createSnapshot,
  killMultipleProcesses,
  killProcessByPid,
  listSnapshots,
  listListeningProcesses,
  killSnapshotItemByIndex,
  restartSnapshotItemByIndex,
  restartSnapshotById,
  runSnapshotItemByIndex,
  runSnapshotById,
  stopContainerById,
} from '../services/process.service.js'

export const getProcesses = async (_req: Request, res: Response) => {
  try {
    const processes = await listListeningProcesses()
    res.json(processes)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ message: 'Unable to fetch listening processes', error: message })
  }
}

export const killSingleProcess = async (
  req: Request<unknown, unknown, KillSinglePayload>,
  res: Response,
) => {
  const { pid, port } = req.body
  if (!pid || Number.isNaN(pid)) {
    res.status(400).json({ message: 'pid must be a valid number' })
    return
  }

  try {
    const result = await killProcessByPid(pid, port)
    res.json({ success: true, pid, port: port ?? null, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const isProtected = message.includes('protected system process')
    res.status(isProtected ? 403 : 500).json({
      message: isProtected ? 'Cannot kill system process' : 'Failed to kill process',
      error: message,
      pid,
    })
  }
}

export const killMultiple = async (
  req: Request<unknown, unknown, KillMultiplePayload>,
  res: Response,
) => {
  const { pids, items } = req.body

  const normalizedItems =
    Array.isArray(items) && items.length > 0
      ? items.filter(
          (item) =>
            Number.isInteger(item.pid) &&
            item.pid > 0 &&
            Number.isInteger(item.port) &&
            item.port > 0,
        )
      : Array.isArray(pids)
        ? pids
            .filter((pid) => Number.isInteger(pid) && pid > 0)
            .map((pid) => ({ pid }))
        : []

  if (normalizedItems.length === 0) {
    res.status(400).json({ message: 'No valid process items found in request' })
    return
  }

  try {
    const result = await killMultipleProcesses(normalizedItems)
    res.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ message: 'Failed to kill multiple processes', error: message })
  }
}

export const stopContainer = async (
  req: Request<unknown, unknown, StopContainerPayload>,
  res: Response,
) => {
  const { containerId } = req.body
  if (!containerId || !containerId.trim()) {
    res.status(400).json({ message: 'containerId is required' })
    return
  }

  try {
    await stopContainerById(containerId)
    res.json({ success: true, containerId })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ message: 'Failed to stop container', error: message })
  }
}

export const createSnapshotHandler = async (
  req: Request<unknown, unknown, CreateSnapshotPayload>,
  res: Response,
) => {
  try {
    const snapshot = await createSnapshot(req.body)
    res.status(201).json(snapshot)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const isClientError = /required|unavailable|no longer|cannot snapshot/i.test(
      message,
    )
    res.status(isClientError ? 400 : 500).json({
      message: 'Failed to create snapshot',
      error: message,
    })
  }
}

export const listSnapshotsHandler = async (_req: Request, res: Response) => {
  try {
    const snapshots = await listSnapshots()
    res.json(snapshots)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ message: 'Failed to list snapshots', error: message })
  }
}

const handleSnapshotExecution = async (
  res: Response,
  action: () => Promise<{
    snapshot: { id: string; name: string }
    started: string[]
    failed: string[]
    conflicts: { port: number; reason: string }[]
  }>,
) => {
  try {
    const result = await action()
    if (result.conflicts.length > 0) {
      res.status(409).json({
        message: 'Snapshot cannot run because some ports are occupied',
        conflicts: result.conflicts,
      })
      return
    }

    res.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const notFound = message.toLowerCase().includes('not found')
    res.status(notFound ? 404 : 500).json({
      message: 'Failed to execute snapshot',
      error: message,
    })
  }
}

export const runSnapshotHandler = async (
  req: Request<{ id: string }>,
  res: Response,
) => {
  await handleSnapshotExecution(res, () => runSnapshotById(req.params.id))
}

export const restartSnapshotHandler = async (
  req: Request<{ id: string }>,
  res: Response,
) => {
  await handleSnapshotExecution(res, () => restartSnapshotById(req.params.id))
}

export const snapshotItemActionHandler = async (
  req: Request<{ id: string; itemIndex: string }, unknown, SnapshotItemActionPayload>,
  res: Response,
) => {
  const index = Number(req.params.itemIndex)
  if (!Number.isInteger(index) || index < 0) {
    res.status(400).json({ message: 'itemIndex must be a non-negative integer' })
    return
  }

  const action = req.body.action
  if (!action || !['run', 'kill', 'restart'].includes(action)) {
    res.status(400).json({ message: 'action must be one of run, kill, restart' })
    return
  }

  try {
    if (action === 'kill') {
      const snapshot = await killSnapshotItemByIndex(req.params.id, index)
      res.json({ snapshot, action })
      return
    }

    const result =
      action === 'run'
        ? await runSnapshotItemByIndex(req.params.id, index)
        : await restartSnapshotItemByIndex(req.params.id, index)

    if (result.conflicts.length > 0) {
      res.status(409).json({
        message: 'Snapshot item cannot run because its port is occupied',
        conflicts: result.conflicts,
      })
      return
    }

    res.json({ ...result, action })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const notFound = message.toLowerCase().includes('not found')
    res.status(notFound ? 404 : 500).json({
      message: 'Failed to execute snapshot item action',
      error: message,
    })
  }
}
