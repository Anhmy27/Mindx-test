import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { runCommand } from '../utils/command.js'
import {
  buildPortToContainerMap,
  listDockerContainers,
  stopDockerContainer,
} from '../utils/docker.js'
import { isSystemProcess } from '../utils/systemProcess.js'
import {
  listSnapshotsFromDisk,
  writeSnapshotToDisk,
} from '../utils/snapshotStore.js'
import type {
  CreateSnapshotPayload,
  ProcessRow,
  Snapshot,
  SnapshotItem,
  SnapshotWithRuntime,
  SnapshotProcessItemPayload,
} from '../types/process.js'

type PowerShellProcessRow = {
  pid: number
  port: number
  processName: string | null
  commandLine: string | null
  workingDirectory: string | null
  executablePath: string | null
  protocol: 'TCP' | 'UDP'
  status: 'LISTENING'
}

const scriptPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../scripts/list-listeners.ps1',
)

const parseProcessRows = async (rawOutput: string): Promise<ProcessRow[]> => {
  const normalized = rawOutput.trim()

  if (!normalized) {
    return []
  }

  const parsed = JSON.parse(normalized) as
    | PowerShellProcessRow
    | PowerShellProcessRow[]

  const rows = Array.isArray(parsed) ? parsed : [parsed]
  const containers = await listDockerContainers()
  const portMap = buildPortToContainerMap(containers)

  return rows.map((row) => {
    const container = portMap.get(row.port) ?? null

    return {
      pid: row.pid,
      port: row.port,
      processName: row.processName ?? null,
      commandLine: row.commandLine ?? null,
      workingDirectory: row.workingDirectory ?? null,
      protocol: row.protocol,
      status: row.status,
      isSystemProcess: isSystemProcess({
        pid: row.pid,
        processName: row.processName,
        executablePath: row.executablePath,
      }),
      containerId: container?.id ?? null,
      containerName: container?.name ?? null,
    }
  })
}

const getProcessIdentity = async (pid: number) => {
  const stdout = await runCommand('powershell', [
    '-NoProfile',
    '-Command',
    `$p = Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}"; if ($null -eq $p) { '{}' } else { @{ processName = $p.Name; executablePath = $p.ExecutablePath } | ConvertTo-Json -Compress }`,
  ])

  const parsed = JSON.parse(stdout.trim() || '{}') as {
    processName?: string | null
    executablePath?: string | null
  }

  return {
    pid,
    processName: parsed.processName ?? null,
    executablePath: parsed.executablePath ?? null,
  }
}

export const listListeningProcesses = async (): Promise<ProcessRow[]> => {
  const stdout = await runCommand('powershell', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    scriptPath,
  ])

  return parseProcessRows(stdout)
}

export const stopContainerById = async (containerId: string): Promise<void> => {
  if (!containerId.trim()) {
    throw new Error('containerId is required')
  }

  await stopDockerContainer(containerId)
}

export const killProcessByPid = async (
  pid: number,
  port?: number,
): Promise<{ mode: 'process' | 'container'; target: string }> => {
  if (typeof port === 'number') {
    const processes = await listListeningProcesses()
    const matched = processes.find((row) => row.pid === pid && row.port === port)

    if (matched?.containerId) {
      await stopDockerContainer(matched.containerId)
      return {
        mode: 'container',
        target: matched.containerName ?? matched.containerId,
      }
    }
  }

  const identity = await getProcessIdentity(pid)

  if (isSystemProcess(identity)) {
    throw new Error(`PID ${pid} is a protected system process`)
  }

  await runCommand('taskkill', ['/PID', `${pid}`, '/F'])
  return { mode: 'process', target: String(pid) }
}

export const killMultipleProcesses = async (
  items: { pid: number; port?: number }[],
) => {
  const processes = await listListeningProcesses()
  const stoppedContainers = new Set<string>()
  const killed: { pid: number; port?: number; mode: string; target: string }[] =
    []
  const failed: { pid: number; port?: number; reason: string }[] = []

  for (const item of items) {
    try {
      if (typeof item.port === 'number') {
        const matched = processes.find(
          (row) => row.pid === item.pid && row.port === item.port,
        )

        if (matched?.containerId) {
          if (!stoppedContainers.has(matched.containerId)) {
            await stopDockerContainer(matched.containerId)
            stoppedContainers.add(matched.containerId)
          }

          killed.push({
            pid: item.pid,
            port: item.port,
            mode: 'container',
            target: matched.containerName ?? matched.containerId,
          })
          continue
        }
      }

      const result = await killProcessByPid(item.pid)
      killed.push({
        pid: item.pid,
        port: item.port,
        mode: result.mode,
        target: result.target,
      })
    } catch (error) {
      failed.push({
        pid: item.pid,
        port: item.port,
        reason: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  return { killed, failed }
}

const escapePowerShellSingleQuoted = (value: string) => value.replace(/'/g, "''")

const parseCommandLine = (
  commandLine: string,
): { executablePath: string; args: string } | null => {
  const trimmed = commandLine.trim()
  if (!trimmed) {
    return null
  }

  if (trimmed.startsWith('"')) {
    const end = trimmed.indexOf('"', 1)
    if (end === -1) {
      return null
    }
    return {
      executablePath: trimmed.slice(1, end),
      args: trimmed.slice(end + 1).trim(),
    }
  }

  const firstSpace = trimmed.indexOf(' ')
  if (firstSpace === -1) {
    return { executablePath: trimmed, args: '' }
  }

  return {
    executablePath: trimmed.slice(0, firstSpace),
    args: trimmed.slice(firstSpace + 1).trim(),
  }
}

const normalizeExecutablePath = (value: string | null | undefined) =>
  (value ?? '')
    .trim()
    .replace(/[\\/]+/g, '/')
    .toLowerCase()

const getExecutableBaseName = (value: string | null | undefined) => {
  const normalized = normalizeExecutablePath(value)
  if (!normalized) {
    return ''
  }
  const parts = normalized.split('/')
  return parts[parts.length - 1] ?? ''
}

const isNodeLikeExecutable = (value: string | null | undefined) => {
  const base = getExecutableBaseName(value)
  return base === 'node' || base === 'node.exe'
}

const areExecutablesCompatible = (
  left: string | null | undefined,
  right: string | null | undefined,
) => {
  const a = normalizeExecutablePath(left)
  const b = normalizeExecutablePath(right)
  if (!a || !b) {
    return false
  }
  if (a === b) {
    return true
  }
  if (isNodeLikeExecutable(a) && isNodeLikeExecutable(b)) {
    return true
  }
  return getExecutableBaseName(a) === getExecutableBaseName(b)
}

const extractProjectMarkers = (item: SnapshotItem): string[] => {
  const markers = new Set<string>()
  if (item.workingDirectory) {
    markers.add(normalizePath(item.workingDirectory))
  }

  const parsed = parseCommandLine(item.commandLine ?? '')
  if (parsed?.args) {
    const firstArg = parsed.args
      .trim()
      .replace(/^"+|"+$/g, '')
      .split(/\s+/)[0]
    // Only treat path-like args as project markers (avoid flags like --type=renderer).
    if (
      firstArg &&
      (/[\\/]/.test(firstArg) || /\.(js|mjs|cjs|ts|tsx)$/i.test(firstArg))
    ) {
      markers.add(normalizePath(firstArg))
    }
  }

  return Array.from(markers).filter((marker) => marker.length > 3)
}

const matchesProjectSignature = (row: ProcessRow, item: SnapshotItem) => {
  const markers = extractProjectMarkers(item)
  if (markers.length === 0) {
    return false
  }

  const haystack = `${normalizePath(row.commandLine)} ${normalizePath(row.workingDirectory)}`
  return markers.some((marker) => haystack.includes(marker))
}

const buildLaunchCommandLine = (
  commandLine: string,
): { executablePath: string; launchCommandLine: string } | null => {
  const parsed = parseCommandLine(commandLine)
  if (!parsed) {
    return null
  }

  // Chromium/Electron subprocesses (renderer/gpu/utility) should not be relaunched directly.
  const isSubProcess =
    /\s--type=/i.test(` ${parsed.args}`) ||
    /\s--utility-sub-type=/i.test(` ${parsed.args}`)

  if (isSubProcess) {
    return {
      executablePath: parsed.executablePath,
      launchCommandLine: `"${parsed.executablePath}"`,
    }
  }

  return {
    executablePath: parsed.executablePath,
    launchCommandLine: commandLine,
  }
}

const launchCommandLine = async (
  commandLine: string,
  workingDirectory: string | null,
) => {
  const lowerCommand = commandLine.toLowerCase()
  const hasNextInternalServer =
    lowerCommand.includes('node_modules\\next\\dist\\server\\lib\\start-server.js') ||
    lowerCommand.includes('node_modules/next/dist/server/lib/start-server.js')

  if (hasNextInternalServer && workingDirectory) {
    const escapedWorkingDir = escapePowerShellSingleQuoted(workingDirectory)
    const command =
      `$wd='${escapedWorkingDir}'; ` +
      `if (Test-Path (Join-Path $wd 'package.json')) { ` +
      `Start-Process -FilePath 'npm.cmd' -ArgumentList @('run','dev') -WorkingDirectory $wd -WindowStyle Hidden ` +
      `} else { throw 'Cannot run Next.js fallback without package.json' }`
    await runCommand('powershell', ['-NoProfile', '-Command', command])
    return
  }

  const parsed = parseCommandLine(commandLine)
  if (!parsed) {
    throw new Error('Invalid command line for snapshot process')
  }

  const escapedFilePath = escapePowerShellSingleQuoted(parsed.executablePath)
  const escapedArgs = escapePowerShellSingleQuoted(parsed.args)
  const escapedWorkingDir = workingDirectory
    ? escapePowerShellSingleQuoted(workingDirectory)
    : null

  const hasArgs = parsed.args.length > 0
  // -WindowStyle Hidden keeps console apps (npm/node) running without a CMD window.
  const command = escapedWorkingDir
    ? hasArgs
      ? `$file='${escapedFilePath}'; $args='${escapedArgs}'; Start-Process -FilePath $file -ArgumentList $args -WorkingDirectory '${escapedWorkingDir}' -WindowStyle Hidden`
      : `$file='${escapedFilePath}'; Start-Process -FilePath $file -WorkingDirectory '${escapedWorkingDir}' -WindowStyle Hidden`
    : hasArgs
      ? `$file='${escapedFilePath}'; $args='${escapedArgs}'; Start-Process -FilePath $file -ArgumentList $args -WindowStyle Hidden`
      : `$file='${escapedFilePath}'; Start-Process -FilePath $file -WindowStyle Hidden`

  await runCommand('powershell', ['-NoProfile', '-Command', command])
}

const launchScript = async (script: string, workingDirectory: string) => {
  const escapedScript = escapePowerShellSingleQuoted(script)
  const escapedWorkingDir = escapePowerShellSingleQuoted(workingDirectory)
  const command =
    `$wd='${escapedWorkingDir}'; $script='${escapedScript}'; ` +
    `Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', $script) -WorkingDirectory $wd -WindowStyle Hidden`
  await runCommand('powershell', ['-NoProfile', '-Command', command])
}

const normalizeText = (value: string | null | undefined) =>
  (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

const normalizePath = (value: string | null | undefined) =>
  (value ?? '')
    .trim()
    .replace(/[\\/]+/g, '/')
    .replace(/\/$/, '')
    .toLowerCase()

const normalizeSnapshotItems = (
  items: SnapshotProcessItemPayload[] | undefined,
): SnapshotProcessItemPayload[] => {
  if (!Array.isArray(items)) {
    return []
  }

  return items
    .filter(
      (item) =>
        Number.isInteger(item.pid) &&
        item.pid > 0 &&
        (item.port === undefined || (Number.isInteger(item.port) && item.port > 0)),
    )
    .map((item) => ({
      pid: item.pid,
      port: item.port,
      script: typeof item.script === 'string' ? item.script.trim() : undefined,
    }))
}

const buildSnapshotId = () => {
  const now = new Date()
  const compact = now.toISOString().replace(/[:.]/g, '-')
  const random = Math.random().toString(36).slice(2, 8)
  return `snapshot-${compact}-${random}`
}

const isProcessRowMatchedBySnapshotItem = (
  row: ProcessRow,
  item: SnapshotItem,
): boolean => {
  if (item.kind === 'container') {
    if (!item.containerId || row.containerId !== item.containerId) {
      return false
    }
    if (item.port && row.port !== item.port) {
      return false
    }
    if (item.protocol && row.protocol !== item.protocol) {
      return false
    }
    return true
  }

  if (row.containerId) {
    return false
  }
  const itemExecutablePath =
    item.executablePath ?? parseCommandLine(item.commandLine ?? '')?.executablePath ?? null

  if (itemExecutablePath) {
    const rowExecutable =
      parseCommandLine(row.commandLine ?? '')?.executablePath ?? ''
    if (!areExecutablesCompatible(rowExecutable, itemExecutablePath)) {
      return false
    }

    const sameWorkingDirectory =
      Boolean(item.workingDirectory) &&
      normalizePath(row.workingDirectory) === normalizePath(item.workingDirectory)

    // Prefer exact cwd; otherwise accept project signature in command/cwd
    // so Node/Next relaunches still count as running when port/cwd drift.
    if (sameWorkingDirectory || matchesProjectSignature(row, item)) {
      return true
    }

    // Desktop app fallback: same executable, no project markers available.
    if (!item.workingDirectory && !item.commandLine) {
      return true
    }

    return false
  }

  if (item.port && row.port !== item.port) {
    return false
  }
  if (item.protocol && row.protocol !== item.protocol) {
    return false
  }
  if (
    item.commandLine &&
    !item.executablePath &&
    normalizeText(row.commandLine) !== normalizeText(item.commandLine)
  ) {
    return false
  }
  if (
    item.workingDirectory &&
    normalizePath(row.workingDirectory) !== normalizePath(item.workingDirectory)
  ) {
    return false
  }
  return true
}

const buildSnapshotRuntime = (snapshot: Snapshot, current: ProcessRow[]) => {
  const itemsRuntime = snapshot.items.map((item) => {
    const matchedRows = current.filter((row) =>
      isProcessRowMatchedBySnapshotItem(row, item),
    )
    return {
      isRunning: matchedRows.length > 0,
      runningPids: matchedRows.map((row) => row.pid),
    }
  })

  return {
    ...snapshot,
    itemsRuntime,
    isFullyRunning:
      snapshot.items.length > 0 && itemsRuntime.every((item) => item.isRunning),
  }
}

const detectPortConflicts = (
  current: ProcessRow[],
  snapshot: Snapshot,
  runtime?: { isRunning: boolean; runningPids: number[] }[],
): { port: number; reason: string }[] => {
  const conflicts: { port: number; reason: string }[] = []

  for (const [index, item] of snapshot.items.entries()) {
    if (item.kind === 'process' && item.executablePath) {
      continue
    }

    if (!item.port || !item.protocol) {
      continue
    }
    if (runtime?.[index]?.isRunning) {
      continue
    }

    const occupiedByOthers = current.filter(
      (row) =>
        row.port === item.port &&
        row.protocol === item.protocol &&
        !isProcessRowMatchedBySnapshotItem(row, item),
    )

    if (occupiedByOthers.length === 0) {
      continue
    }

    const first = occupiedByOthers[0]
    conflicts.push({
      port: item.port,
      reason: `Port ${item.port}/${item.protocol} is being used by ${first.processName ?? 'unknown process'} (PID ${first.pid})`,
    })
  }

  return conflicts
}

const runSnapshotItems = async (items: SnapshotItem[]) => {
  const started: string[] = []
  const failed: string[] = []

  for (const item of items) {
    try {
      if (item.kind === 'container' && item.containerId) {
        await runCommand('docker', ['start', item.containerId])
        started.push(item.containerName ?? item.containerId)
        continue
      }

      if (item.kind === 'process') {
        if (item.script && item.workingDirectory) {
          await launchScript(item.script, item.workingDirectory)
          started.push(item.processName ?? item.script)
          continue
        }

        if (item.commandLine) {
          const launchInfo = buildLaunchCommandLine(item.commandLine)
          await launchCommandLine(
            launchInfo?.launchCommandLine ?? item.commandLine,
            item.workingDirectory,
          )
          started.push(item.processName ?? item.commandLine)
          continue
        }
      }

      failed.push(
        item.kind === 'container'
          ? `Cannot start container on port ${item.port ?? 'N/A'}`
          : `Missing command/script for process on port ${item.port ?? 'N/A'}`,
      )
    } catch (error) {
      failed.push(
        error instanceof Error
          ? error.message
          : `Failed to run item on port ${item.port ?? 'N/A'}`,
      )
    }
  }

  return { started, failed }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const verifyStartedItems = async (
  snapshot: Snapshot,
  candidateIndexes: number[],
  started: string[],
  failed: string[],
) => {
  // Next/Vite can take longer than a quick desktop app to bind a listen port.
  const deadline = Date.now() + 8000
  let runtime = buildSnapshotRuntime(snapshot, await listListeningProcesses())

  while (Date.now() < deadline) {
    const pending = candidateIndexes.filter(
      (index) => !runtime.itemsRuntime[index]?.isRunning,
    )
    if (pending.length === 0) {
      break
    }
    await sleep(1000)
    runtime = buildSnapshotRuntime(snapshot, await listListeningProcesses())
  }

  for (const index of candidateIndexes) {
    const item = snapshot.items[index]
    if (!item) {
      continue
    }
    if (runtime.itemsRuntime[index]?.isRunning) {
      continue
    }

    const name =
      item.kind === 'container'
        ? item.containerName ?? item.containerId ?? `port ${item.port ?? 'N/A'}`
        : item.processName ?? item.executablePath ?? item.commandLine ?? 'process'

    const startedIndex = started.findIndex((entry) => entry === name)
    if (startedIndex >= 0) {
      started.splice(startedIndex, 1)
    }
    failed.push(`${name} did not stay running after launch`)
  }
}

const findSnapshotById = async (snapshotId: string) => {
  const snapshots = await listSnapshotsFromDisk()
  return snapshots.find((snapshot) => snapshot.id === snapshotId) ?? null
}

const getSnapshotWithRuntime = async (snapshot: Snapshot) => {
  const current = await listListeningProcesses()
  return buildSnapshotRuntime(snapshot, current)
}

const stopSnapshotItem = async (item: SnapshotItem): Promise<number> => {
  if (item.kind === 'container') {
    if (!item.containerId) {
      return 0
    }
    await stopDockerContainer(item.containerId)
    return 1
  }

  const current = await listListeningProcesses()
  const matchedRows = current.filter((row) =>
    isProcessRowMatchedBySnapshotItem(row, item),
  )

  let stopped = 0
  for (const row of matchedRows) {
    try {
      await killProcessByPid(row.pid, row.port)
      stopped += 1
    } catch {
      // Keep best effort semantics for batch stop.
    }
  }
  return stopped
}

export const createSnapshot = async (
  payload: CreateSnapshotPayload,
): Promise<SnapshotWithRuntime> => {
  const name = (payload.name ?? '').trim()
  if (!name) {
    throw new Error('Snapshot name is required')
  }

  const normalizedItems = normalizeSnapshotItems(payload.items)
  if (normalizedItems.length === 0) {
    throw new Error('At least one process is required to create a snapshot')
  }

  const rows = await listListeningProcesses()
  const snapshotItems: SnapshotItem[] = []

  for (const item of normalizedItems) {
    const matched = rows.find(
      (row) => row.pid === item.pid && (item.port ? row.port === item.port : true),
    )

    if (!matched) {
      continue
    }

    if (matched.containerId) {
      snapshotItems.push({
        kind: 'container',
        port: matched.port,
        protocol: matched.protocol,
        processName: matched.processName,
        executablePath: null,
        commandLine: null,
        workingDirectory: null,
        script: null,
        containerId: matched.containerId,
        containerName: matched.containerName,
      })
      continue
    }

    if (!matched.commandLine) {
      throw new Error(
        `Cannot snapshot PID ${matched.pid} because command line is unavailable`,
      )
    }

    const launchInfo = buildLaunchCommandLine(matched.commandLine)
    if (!launchInfo) {
      throw new Error(`Cannot parse command line for PID ${matched.pid}`)
    }

    snapshotItems.push({
      kind: 'process',
      port: matched.port,
      protocol: matched.protocol,
      processName: matched.processName,
      executablePath: launchInfo.executablePath,
      commandLine: launchInfo.launchCommandLine,
      workingDirectory: matched.workingDirectory,
      script: item.script?.trim() ? item.script.trim() : null,
      containerId: null,
      containerName: null,
    })
  }

  const deduplicated = snapshotItems.filter((item, index, arr) => {
    if (item.kind === 'container') {
      return (
        arr.findIndex(
          (entry) =>
            entry.kind === 'container' && entry.containerId === item.containerId,
        ) === index
      )
    }

    return (
      arr.findIndex(
        (entry) =>
          entry.kind === 'process' &&
          entry.commandLine === item.commandLine &&
          entry.port === item.port &&
          entry.script === item.script,
      ) === index
    )
  })

  if (deduplicated.length === 0) {
    throw new Error('Selected processes are no longer available')
  }

  const snapshot: Snapshot = {
    id: buildSnapshotId(),
    name,
    createdAt: new Date().toISOString(),
    items: deduplicated,
  }

  await writeSnapshotToDisk(snapshot)
  return getSnapshotWithRuntime(snapshot)
}

export const listSnapshots = async () => {
  const snapshots = await listSnapshotsFromDisk()
  const current = await listListeningProcesses()
  return snapshots.map((snapshot) => buildSnapshotRuntime(snapshot, current))
}

export const runSnapshotById = async (snapshotId: string) => {
  const snapshot = await findSnapshotById(snapshotId)
  if (!snapshot) {
    throw new Error('Snapshot not found')
  }

  const current = await listListeningProcesses()
  const runtime = buildSnapshotRuntime(snapshot, current)
  const conflicts = detectPortConflicts(current, snapshot, runtime.itemsRuntime)
  if (conflicts.length > 0) {
    return {
      snapshot: runtime,
      started: [],
      failed: [],
      conflicts,
    }
  }

  const pendingIndexes = snapshot.items
    .map((_, index) => index)
    .filter((index) => !runtime.itemsRuntime[index].isRunning)
  const pendingItems = pendingIndexes.map((index) => snapshot.items[index])
  const { started, failed } = await runSnapshotItems(pendingItems)
  await verifyStartedItems(snapshot, pendingIndexes, started, failed)
  const updated = await getSnapshotWithRuntime(snapshot)
  return {
    snapshot: updated,
    started,
    failed,
    conflicts: [] as { port: number; reason: string }[],
  }
}

export const restartSnapshotById = async (snapshotId: string) => {
  const snapshot = await findSnapshotById(snapshotId)
  if (!snapshot) {
    throw new Error('Snapshot not found')
  }

  for (const item of snapshot.items) {
    await stopSnapshotItem(item)
  }

  const currentAfterStop = await listListeningProcesses()
  const runtimeAfterStop = buildSnapshotRuntime(snapshot, currentAfterStop)
  const conflicts = detectPortConflicts(
    currentAfterStop,
    snapshot,
    runtimeAfterStop.itemsRuntime,
  )
  if (conflicts.length > 0) {
    return {
      snapshot: runtimeAfterStop,
      started: [],
      failed: [],
      conflicts,
    }
  }

  const { started, failed } = await runSnapshotItems(snapshot.items)
  const updated = await getSnapshotWithRuntime(snapshot)
  return {
    snapshot: updated,
    started,
    failed,
    conflicts: [] as { port: number; reason: string }[],
  }
}

export const runSnapshotItemByIndex = async (
  snapshotId: string,
  itemIndex: number,
) => {
  const snapshot = await findSnapshotById(snapshotId)
  if (!snapshot) {
    throw new Error('Snapshot not found')
  }

  const item = snapshot.items[itemIndex]
  if (!item) {
    throw new Error('Snapshot item not found')
  }

  const current = await listListeningProcesses()
  const runtime = buildSnapshotRuntime(snapshot, current)
  if (runtime.itemsRuntime[itemIndex]?.isRunning) {
    return {
      snapshot: runtime,
      started: [],
      failed: [],
      conflicts: [],
    }
  }

  const oneItemSnapshot: Snapshot = {
    ...snapshot,
    items: [item],
  }
  const conflicts = detectPortConflicts(current, oneItemSnapshot)
  if (conflicts.length > 0) {
    return {
      snapshot: runtime,
      started: [],
      failed: [],
      conflicts,
    }
  }

  const { started, failed } = await runSnapshotItems([item])
  await verifyStartedItems(snapshot, [itemIndex], started, failed)
  const updated = await getSnapshotWithRuntime(snapshot)
  return { snapshot: updated, started, failed, conflicts: [] }
}

export const killSnapshotItemByIndex = async (
  snapshotId: string,
  itemIndex: number,
) => {
  const snapshot = await findSnapshotById(snapshotId)
  if (!snapshot) {
    throw new Error('Snapshot not found')
  }

  const item = snapshot.items[itemIndex]
  if (!item) {
    throw new Error('Snapshot item not found')
  }

  await stopSnapshotItem(item)
  return getSnapshotWithRuntime(snapshot)
}

export const restartSnapshotItemByIndex = async (
  snapshotId: string,
  itemIndex: number,
) => {
  const snapshot = await findSnapshotById(snapshotId)
  if (!snapshot) {
    throw new Error('Snapshot not found')
  }

  const item = snapshot.items[itemIndex]
  if (!item) {
    throw new Error('Snapshot item not found')
  }

  await stopSnapshotItem(item)
  const currentAfterStop = await listListeningProcesses()
  const oneItemSnapshot: Snapshot = {
    ...snapshot,
    items: [item],
  }
  const conflicts = detectPortConflicts(currentAfterStop, oneItemSnapshot)
  if (conflicts.length > 0) {
    return {
      snapshot: await getSnapshotWithRuntime(snapshot),
      started: [],
      failed: [],
      conflicts,
    }
  }

  const { started, failed } = await runSnapshotItems([item])
  await verifyStartedItems(snapshot, [itemIndex], started, failed)
  const updated = await getSnapshotWithRuntime(snapshot)
  return { snapshot: updated, started, failed, conflicts: [] }
}
