export type ProcessRow = {
  pid: number
  port: number
  processName: string | null
  commandLine: string | null
  workingDirectory: string | null
  protocol: 'TCP' | 'UDP'
  status: 'LISTENING' | 'NOT_LISTENING'
  isSystemProcess: boolean
  containerId: string | null
  containerName: string | null
}

export type KillSinglePayload = {
  pid?: number
  port?: number
}

export type KillMultiplePayload = {
  pids?: number[]
  items?: { pid: number; port: number }[]
}

export type StopContainerPayload = {
  containerId?: string
}

export type SnapshotProcessItemPayload = {
  pid: number
  port?: number
  script?: string
}

export type CreateSnapshotPayload = {
  name?: string
  items?: SnapshotProcessItemPayload[]
}

export type SnapshotKind = 'container' | 'process'

export type SnapshotItem = {
  kind: SnapshotKind
  port: number | null
  protocol: 'TCP' | 'UDP' | null
  processName: string | null
  executablePath: string | null
  commandLine: string | null
  workingDirectory: string | null
  script: string | null
  containerId: string | null
  containerName: string | null
}

export type Snapshot = {
  id: string
  name: string
  createdAt: string
  items: SnapshotItem[]
}

export type SnapshotItemRuntime = {
  isRunning: boolean
  runningPids: number[]
}

export type SnapshotWithRuntime = Snapshot & {
  itemsRuntime: SnapshotItemRuntime[]
  isFullyRunning: boolean
}

export type SnapshotItemAction = 'run' | 'kill' | 'restart'

export type SnapshotItemActionPayload = {
  action?: SnapshotItemAction
}
