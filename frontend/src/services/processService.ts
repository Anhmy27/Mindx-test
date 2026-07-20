import type { ProcessRow, SnapshotWithRuntime } from '../types/process'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:4000'

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...init,
  })

  if (!response.ok) {
    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      const body = (await response.json()) as {
        message?: string
        error?: string
        conflicts?: { reason?: string }[]
      }
      const conflictMessages = (body.conflicts ?? [])
        .map((item) => item.reason)
        .filter((reason): reason is string => Boolean(reason))
      const details = [body.error, ...conflictMessages].filter(Boolean).join('\n')
      const message = body.message ?? 'Request failed'
      throw new Error(details ? `${message}\n${details}` : message)
    }

    const message = await response.text()
    throw new Error(message || 'Request failed')
  }

  return (await response.json()) as T
}

export const processService = {
  list: () => request<ProcessRow[]>('/api/processes'),
  killOne: (pid: number, port: number) =>
    request<{
      success: boolean
      pid: number
      mode: 'process' | 'container'
      target: string
    }>('/api/processes/kill', {
      method: 'POST',
      body: JSON.stringify({ pid, port }),
    }),
  killMultiple: (items: { pid: number; port: number }[]) =>
    request<{
      killed: { pid: number; port?: number; mode: string; target: string }[]
      failed: { pid: number; port?: number; reason: string }[]
    }>('/api/processes/kill-multiple', {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),
  stopContainer: (containerId: string) =>
    request<{ success: boolean; containerId: string }>(
      '/api/processes/stop-container',
      {
        method: 'POST',
        body: JSON.stringify({ containerId }),
      },
    ),
  createSnapshot: (
    name: string,
    items: { pid: number; port?: number; script?: string }[],
  ) =>
    request<SnapshotWithRuntime>('/api/snapshots', {
      method: 'POST',
      body: JSON.stringify({ name, items }),
    }),
  listSnapshots: () => request<SnapshotWithRuntime[]>('/api/snapshots'),
  runSnapshot: (snapshotId: string) =>
    request<{
      snapshot: SnapshotWithRuntime
      started: string[]
      failed: string[]
      conflicts: { port: number; reason: string }[]
    }>(`/api/snapshots/${snapshotId}/run`, { method: 'POST' }),
  restartSnapshot: (snapshotId: string) =>
    request<{
      snapshot: SnapshotWithRuntime
      started: string[]
      failed: string[]
      conflicts: { port: number; reason: string }[]
    }>(`/api/snapshots/${snapshotId}/restart`, { method: 'POST' }),
  snapshotItemAction: (
    snapshotId: string,
    itemIndex: number,
    action: 'run' | 'kill' | 'restart',
  ) =>
    request<{
      snapshot: SnapshotWithRuntime
      started?: string[]
      failed?: string[]
      conflicts?: { port: number; reason: string }[]
      action: 'run' | 'kill' | 'restart'
    }>(`/api/snapshots/${snapshotId}/items/${itemIndex}/action`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    }),
}
