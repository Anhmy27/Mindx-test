export type ListeningStatus = 'LISTENING' | 'NOT_LISTENING'
export type Protocol = 'TCP' | 'UDP'

export type ProcessRow = {
  pid: number
  port: number
  processName: string | null
  commandLine: string | null
  workingDirectory: string | null
  protocol: Protocol
  status: ListeningStatus
  isSystemProcess: boolean
  containerId: string | null
  containerName: string | null
}

/** One table row; Docker ports with multiple host listeners share a single group. */
export type GroupedProcessRow = ProcessRow & {
  processes: ProcessRow[]
}

export type SortField = 'port' | 'pid' | 'processName'
export type SortDirection = 'asc' | 'desc'

export const canTerminateProcess = (row: ProcessRow) =>
  Boolean(row.containerId) || !row.isSystemProcess

export type SnapshotItem = {
  kind: 'container' | 'process'
  port: number | null
  protocol: Protocol | null
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
