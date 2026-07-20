import { useMemo, useState } from 'react'
import type { SnapshotWithRuntime } from '../types/process'

type SnapshotPageProps = {
  snapshots: SnapshotWithRuntime[]
  loading: boolean
  runningSnapshotId: string | null
  restartingSnapshotId: string | null
  itemActionTarget: {
    snapshotId: string
    itemIndex: number
    action: 'run' | 'kill' | 'restart'
  } | null
  onRefresh: () => Promise<void>
  onRunAll: (snapshotId: string) => Promise<void>
  onRestartAll: (snapshotId: string) => Promise<void>
  onItemAction: (
    snapshotId: string,
    itemIndex: number,
    action: 'run' | 'kill' | 'restart',
  ) => Promise<void>
}

const formatDateTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString()
}

export const SnapshotPage = ({
  snapshots,
  loading,
  runningSnapshotId,
  restartingSnapshotId,
  itemActionTarget,
  onRefresh,
  onRunAll,
  onRestartAll,
  onItemAction,
}: SnapshotPageProps) => {
  const [expandedSnapshotIds, setExpandedSnapshotIds] = useState<string[]>([])
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'running' | 'stopped'>(
    'all',
  )

  const expandedSet = useMemo(
    () => new Set(expandedSnapshotIds),
    [expandedSnapshotIds],
  )

  const filteredSnapshots = useMemo(() => {
    const q = search.trim().toLowerCase()
    return snapshots.filter((snapshot) => {
      if (statusFilter === 'running' && !snapshot.isFullyRunning) {
        return false
      }
      if (statusFilter === 'stopped' && snapshot.isFullyRunning) {
        return false
      }

      if (!q) {
        return true
      }

      const inSnapshotName = snapshot.name.toLowerCase().includes(q)
      const inItems = snapshot.items.some((item) => {
        const processLabel =
          item.kind === 'container'
            ? item.containerName ?? item.containerId ?? ''
            : item.processName ?? ''

        const portLabel =
          item.port && item.protocol ? `${item.protocol} ${item.port}` : ''

        return (
          processLabel.toLowerCase().includes(q) || portLabel.toLowerCase().includes(q)
        )
      })

      return inSnapshotName || inItems
    })
  }, [search, snapshots, statusFilter])

  const toggleExpanded = (snapshotId: string) => {
    setExpandedSnapshotIds((current) =>
      current.includes(snapshotId)
        ? current.filter((id) => id !== snapshotId)
        : [...current, snapshotId],
    )
  }

  return (
    <section className="min-h-0 flex h-full flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Snapshots</h2>
            <p className="text-sm text-slate-400">
              Save and restore selected processes quickly.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onRefresh()}
            disabled={loading}
            className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Refresh
          </button>
        </div>

        <div className="flex flex-col gap-2 md:flex-row">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter by snapshot name, process or port..."
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-violet-400"
          />
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as 'all' | 'running' | 'stopped')
            }
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none transition hover:border-slate-500"
          >
            <option value="all">All status</option>
            <option value="running">Fully running</option>
            <option value="stopped">Not fully running</option>
          </select>
        </div>
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-lg border border-slate-800 bg-slate-950/35 p-3">
        {loading ? (
          <div className="rounded-md border border-slate-800 bg-slate-900/80 px-4 py-3 text-sm text-slate-300">
            Loading snapshots...
          </div>
        ) : null}

        {!loading && snapshots.length === 0 ? (
          <div className="rounded-md border border-slate-800 bg-slate-900/80 px-4 py-3 text-sm text-slate-300">
            No snapshots yet. Select one or more processes and create your first
            snapshot.
          </div>
        ) : null}

        {!loading && snapshots.length > 0 && filteredSnapshots.length === 0 ? (
          <div className="rounded-md border border-slate-800 bg-slate-900/80 px-4 py-3 text-sm text-slate-300">
            No snapshots match your current filter.
          </div>
        ) : null}

        <div className="space-y-3">
          {filteredSnapshots.map((snapshot) => (
          <article
            key={snapshot.id}
            className="rounded-lg border border-slate-800 bg-slate-950/70 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-700 bg-slate-800/80 text-base text-slate-200 transition hover:border-slate-500 hover:bg-slate-700"
                    onClick={() => toggleExpanded(snapshot.id)}
                    aria-expanded={expandedSet.has(snapshot.id)}
                    aria-label={
                      expandedSet.has(snapshot.id)
                        ? 'Collapse snapshot items'
                        : 'Expand snapshot items'
                    }
                  >
                    {expandedSet.has(snapshot.id) ? '▾' : '▸'}
                  </button>
                  <h3 className="text-base font-semibold text-slate-100">
                    {snapshot.name}
                  </h3>
                </div>
                <p className="text-xs text-slate-400">
                  Created: {formatDateTime(snapshot.createdAt)}
                </p>
              </div>
              <div className="flex gap-2">
                {!snapshot.isFullyRunning ? (
                  <button
                    type="button"
                    onClick={() => void onRunAll(snapshot.id)}
                    disabled={
                      loading ||
                      runningSnapshotId === snapshot.id ||
                      restartingSnapshotId === snapshot.id
                    }
                    className="rounded-md border border-emerald-600/60 bg-emerald-700/30 px-3 py-1.5 text-xs text-emerald-100 transition hover:bg-emerald-700/45 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {runningSnapshotId === snapshot.id ? 'Running...' : '▶ Run all'}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void onRestartAll(snapshot.id)}
                  disabled={
                    loading ||
                    runningSnapshotId === snapshot.id ||
                    restartingSnapshotId === snapshot.id
                  }
                  className="rounded-md border border-violet-600/60 bg-violet-700/30 px-3 py-1.5 text-xs text-violet-100 transition hover:bg-violet-700/45 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {restartingSnapshotId === snapshot.id
                    ? 'Restarting...'
                    : 'Restart'}
                </button>
              </div>
            </div>

            {expandedSet.has(snapshot.id) ? (
              <div className="mt-3 grid gap-2">
                {snapshot.items.map((item, index) => {
                  const runtime = snapshot.itemsRuntime[index]
                  const isRunning = Boolean(runtime?.isRunning)
                  const itemKey = `${snapshot.id}-${index}`
                  const isMenuOpen = openMenuKey === itemKey
                  const isItemBusy =
                    itemActionTarget?.snapshotId === snapshot.id &&
                    itemActionTarget.itemIndex === index

                  return (
                    <div
                      key={`${snapshot.id}-${item.kind}-${item.port ?? 'none'}-${index}`}
                      className="flex items-center justify-between rounded border border-slate-800 bg-slate-900/50 px-3 py-2 text-sm text-slate-200"
                    >
                      <div>
                        <span className="font-medium text-slate-100">
                          {item.kind === 'container'
                            ? item.containerName ?? item.containerId ?? 'Container'
                            : item.processName ?? 'Process'}
                        </span>
                        <span className="ml-2 text-slate-400">
                          {item.port && item.protocol
                            ? `(${item.protocol} ${item.port})`
                            : '(No port)'}
                        </span>
                        <span
                          className={`ml-2 rounded px-2 py-0.5 text-[10px] uppercase ${
                            isRunning
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-slate-700/70 text-slate-300'
                          }`}
                        >
                          {isRunning ? 'Running' : 'Stopped'}
                        </span>
                      </div>

                      <div className="relative flex items-center gap-2">
                        {!isRunning ? (
                          <button
                            type="button"
                            onClick={() =>
                              void onItemAction(snapshot.id, index, 'run')
                            }
                            disabled={loading || isItemBusy}
                            className="rounded-md border border-emerald-600/60 bg-emerald-700/30 px-2.5 py-1 text-xs text-emerald-100 transition hover:bg-emerald-700/45 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isItemBusy && itemActionTarget?.action === 'run'
                              ? 'Running...'
                              : 'Run'}
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={() =>
                            setOpenMenuKey((current) =>
                              current === itemKey ? null : itemKey,
                            )
                          }
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-700 bg-slate-800 text-sm text-slate-200 transition hover:border-slate-500 hover:bg-slate-700"
                        >
                          ⋮
                        </button>

                        {isMenuOpen ? (
                          <div className="absolute right-0 top-9 z-20 min-w-[120px] rounded-md border border-slate-700 bg-slate-900 p-1 shadow-xl">
                            <button
                              type="button"
                              disabled={!isRunning || loading || isItemBusy}
                              onClick={() => {
                                setOpenMenuKey(null)
                                void onItemAction(snapshot.id, index, 'kill')
                              }}
                              className="block w-full rounded px-2 py-1.5 text-left text-xs text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {isItemBusy && itemActionTarget?.action === 'kill'
                                ? 'Killing...'
                                : 'Kill'}
                            </button>
                            <button
                              type="button"
                              disabled={!isRunning || loading || isItemBusy}
                              onClick={() => {
                                setOpenMenuKey(null)
                                void onItemAction(snapshot.id, index, 'restart')
                              }}
                              className="block w-full rounded px-2 py-1.5 text-left text-xs text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {isItemBusy && itemActionTarget?.action === 'restart'
                                ? 'Restarting...'
                                : 'Restart'}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </article>
          ))}
        </div>
      </div>
    </section>
  )
}
