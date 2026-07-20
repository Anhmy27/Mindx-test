import type { ProcessRow } from '../types/process'

export const getProcessKey = (row: ProcessRow) => {
  if (row.containerId) {
    return `docker-${row.protocol}-${row.port}-${row.containerId}`
  }

  return `${row.protocol}-${row.port}-${row.pid}`
}
