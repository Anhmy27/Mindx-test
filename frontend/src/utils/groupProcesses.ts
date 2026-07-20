import type { GroupedProcessRow, ProcessRow } from '../types/process'

const getGroupKey = (row: ProcessRow) => {
  if (row.containerId) {
    return `docker:${row.protocol}:${row.port}:${row.containerId}`
  }

  return `process:${row.protocol}:${row.port}:${row.pid}`
}

const pickPrimary = (processes: ProcessRow[]): ProcessRow => {
  const dockerBackend = processes.find((process) =>
    (process.processName ?? '').toLowerCase().includes('docker.backend'),
  )

  if (dockerBackend) {
    return dockerBackend
  }

  return [...processes].sort((a, b) => a.pid - b.pid)[0] ?? processes[0]
}

export const groupProcesses = (rows: ProcessRow[]): GroupedProcessRow[] => {
  const groups = new Map<string, ProcessRow[]>()

  for (const row of rows) {
    const key = getGroupKey(row)
    const current = groups.get(key)

    if (current) {
      current.push(row)
    } else {
      groups.set(key, [row])
    }
  }

  return Array.from(groups.values()).map((processes) => {
    const primary = pickPrimary(processes)

    return {
      ...primary,
      processes: [...processes].sort((a, b) => a.pid - b.pid),
    }
  })
}
