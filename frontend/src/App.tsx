import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getProcessKey,
  ProcessTable,
} from './components/ProcessTable'
import { ProcessDetailPanel } from './components/ProcessDetailPanel'
import { SnapshotCreateModal } from './components/SnapshotCreateModal'
import { SnapshotPage } from './components/SnapshotPage'
import { Toolbar } from './components/Toolbar'
import { useToast } from './components/ToastProvider'
import { useProcesses } from './hooks/useProcesses'
import { processService } from './services/processService'
import type { GroupedProcessRow, SnapshotWithRuntime } from './types/process'

const VIEW_STORAGE_KEY = 'devport:view'

const getInitialView = (): 'processes' | 'snapshots' => {
  const raw = window.localStorage.getItem(VIEW_STORAGE_KEY)
  return raw === 'snapshots' ? 'snapshots' : 'processes'
}

function App() {
  const toast = useToast()
  const {
    visibleRows,
    totalCount,
    filteredCount,
    loading,
    error,
    search,
    setSearch,
    sortField,
    sortDirection,
    toggleSort,
    setPortSortDirection,
    selectedKeys,
    selectedRows,
    toggleSelected,
    toggleSelectVisible,
    allVisibleSelected,
    refresh,
    killOne,
    killSelected,
    clearSelection,
  } = useProcesses()

  const [selectedProcess, setSelectedProcess] =
    useState<GroupedProcessRow | null>(null)
  const [isTerminating, setIsTerminating] = useState(false)
  const [terminatingKey, setTerminatingKey] = useState<string | null>(null)
  const [view, setView] = useState<'processes' | 'snapshots'>(getInitialView)
  const [snapshots, setSnapshots] = useState<SnapshotWithRuntime[]>([])
  const [snapshotsLoading, setSnapshotsLoading] = useState(false)
  const [runningSnapshotId, setRunningSnapshotId] = useState<string | null>(null)
  const [restartingSnapshotId, setRestartingSnapshotId] = useState<string | null>(
    null,
  )
  const [snapshotItemActionTarget, setSnapshotItemActionTarget] = useState<{
    snapshotId: string
    itemIndex: number
    action: 'run' | 'kill' | 'restart'
  } | null>(null)
  const [snapshotModalOpen, setSnapshotModalOpen] = useState(false)
  const [creatingSnapshot, setCreatingSnapshot] = useState(false)

  const selectedSnapshotDrafts = useMemo(
    () =>
      selectedRows.map((row) => ({
        key: getProcessKey(row),
        pid: row.pid,
        port: row.port,
        processName: row.processName ?? row.containerName ?? 'Unknown process',
        isContainer: Boolean(row.containerId),
      })),
    [selectedRows],
  )

  useEffect(() => {
    setSelectedProcess((current) => {
      if (!current) {
        return null
      }

      const stillExists = visibleRows.find(
        (row) => getProcessKey(row) === getProcessKey(current),
      )

      return stillExists ?? null
    })
  }, [visibleRows])

  useEffect(() => {
    if (!error) {
      return
    }
    toast.error(error)
    // Intentionally omit toast from deps to avoid duplicate toasts when provider re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error])

  const loadSnapshots = useCallback(async () => {
    setSnapshotsLoading(true)
    try {
      const data = await processService.listSnapshots()
      setSnapshots(data)
    } catch (snapshotError) {
      toast.error(
        snapshotError instanceof Error
          ? snapshotError.message
          : 'Failed to load snapshots',
      )
    } finally {
      setSnapshotsLoading(false)
    }
  }, [toast])

  useEffect(() => {
    if (view === 'snapshots') {
      void loadSnapshots()
      setSelectedProcess(null)
    }
  }, [loadSnapshots, view])

  useEffect(() => {
    window.localStorage.setItem(VIEW_STORAGE_KEY, view)
  }, [view])

  const handleKillOne = async (row: GroupedProcessRow) => {
    if (isTerminating) {
      return
    }

    const message = row.containerId
      ? `Stop Docker container "${row.containerName ?? row.containerId}" (port ${row.port})?`
      : `Kill process PID ${row.pid}?`

    const confirmed = await toast.confirm(message)
    if (!confirmed) {
      return
    }

    const rowKey = getProcessKey(row)
    const loadingId = toast.loading(
      row.containerId
        ? `Stopping container ${row.containerName ?? row.containerId}...`
        : `Killing process PID ${row.pid}...`,
    )

    setIsTerminating(true)
    setTerminatingKey(rowKey)

    try {
      const result = await killOne(row)
      toast.dismiss(loadingId)
      toast.success(
        result.mode === 'container'
          ? `Stopped container ${result.target}`
          : `Killed process PID ${result.target}`,
      )
      setSelectedProcess((current) =>
        current && getProcessKey(current) === rowKey ? null : current,
      )
    } catch (killError) {
      toast.dismiss(loadingId)
      toast.error(
        killError instanceof Error
          ? killError.message
          : `Failed to terminate PID ${row.pid}`,
      )
    } finally {
      setIsTerminating(false)
      setTerminatingKey(null)
    }
  }

  const handleKillSelected = async () => {
    if (selectedRows.length === 0 || isTerminating) {
      return
    }

    const containerCount = selectedRows.filter((row) => row.containerId).length
    const processCount = selectedRows.length - containerCount
    const confirmed = await toast.confirm(
      `Terminate ${selectedRows.length} selected item(s)? (${containerCount} container, ${processCount} process)`,
    )
    if (!confirmed) {
      return
    }

    const loadingId = toast.loading(
      `Terminating ${selectedRows.length} selected item(s)...`,
    )
    setIsTerminating(true)

    try {
      const result = await killSelected()
      toast.dismiss(loadingId)
      if (result.failed.length > 0) {
        toast.error(
          `Done ${result.killed.length}, failed ${result.failed.length}`,
        )
        return
      }
      toast.success(`Terminated ${result.killed.length} item(s)`)
    } catch (killError) {
      toast.dismiss(loadingId)
      toast.error(
        killError instanceof Error
          ? killError.message
          : 'Failed to terminate selected items',
      )
    } finally {
      setIsTerminating(false)
    }
  }

  const handleSelectRow = (row: GroupedProcessRow) => {
    setSelectedProcess((current) =>
      current && getProcessKey(current) === getProcessKey(row) ? null : row,
    )
  }

  const handleCloseDetail = useCallback(() => {
    setSelectedProcess(null)
  }, [])

  const handleOpenSnapshotModal = () => {
    if (selectedRows.length === 0) {
      toast.info('Select at least one process to create a snapshot')
      return
    }

    setSnapshotModalOpen(true)
  }

  const handleCreateSnapshot = async (
    name: string,
    scripts: Record<string, string>,
  ) => {
    if (selectedRows.length === 0) {
      return
    }

    setCreatingSnapshot(true)
    try {
      const snapshot = await processService.createSnapshot(
        name,
        selectedRows.map((row) => {
          const key = getProcessKey(row)
          const script = scripts[key]?.trim()
          return {
            pid: row.pid,
            port: row.port,
            script: script ? script : undefined,
          }
        }),
      )
      clearSelection()
      setSnapshotModalOpen(false)
      toast.success(`Created snapshot "${snapshot.name}"`)
      await loadSnapshots()
    } catch (snapshotError) {
      toast.error(
        snapshotError instanceof Error
          ? snapshotError.message
          : 'Failed to create snapshot',
      )
    } finally {
      setCreatingSnapshot(false)
    }
  }

  const handleRunSnapshot = async (snapshotId: string) => {
    setRunningSnapshotId(snapshotId)
    const loadingId = toast.loading('Running snapshot...')
    try {
      const result = await processService.runSnapshot(snapshotId)
      toast.dismiss(loadingId)
      if (result.failed.length > 0) {
        toast.error(`Started ${result.started.length}, failed ${result.failed.length}`)
      } else {
        toast.success(`Snapshot "${result.snapshot.name}" started successfully`)
      }
      await refresh()
    } catch (runError) {
      toast.dismiss(loadingId)
      toast.error(runError instanceof Error ? runError.message : 'Failed to run snapshot')
    } finally {
      setRunningSnapshotId(null)
      await loadSnapshots()
    }
  }

  const handleRestartSnapshot = async (snapshotId: string) => {
    setRestartingSnapshotId(snapshotId)
    const loadingId = toast.loading('Restarting snapshot...')
    try {
      const result = await processService.restartSnapshot(snapshotId)
      toast.dismiss(loadingId)
      if (result.failed.length > 0) {
        toast.error(`Restarted ${result.started.length}, failed ${result.failed.length}`)
      } else {
        toast.success(`Snapshot "${result.snapshot.name}" restarted successfully`)
      }
      await refresh()
    } catch (restartError) {
      toast.dismiss(loadingId)
      toast.error(
        restartError instanceof Error
          ? restartError.message
          : 'Failed to restart snapshot',
      )
    } finally {
      setRestartingSnapshotId(null)
      await loadSnapshots()
    }
  }

  const handleSnapshotItemAction = async (
    snapshotId: string,
    itemIndex: number,
    action: 'run' | 'kill' | 'restart',
  ) => {
    setSnapshotItemActionTarget({ snapshotId, itemIndex, action })
    const loadingId = toast.loading(
      action === 'run'
        ? 'Running snapshot item...'
        : action === 'kill'
          ? 'Killing snapshot item...'
          : 'Restarting snapshot item...',
    )

    try {
      const result = await processService.snapshotItemAction(
        snapshotId,
        itemIndex,
        action,
      )
      toast.dismiss(loadingId)
      setSnapshots((current) =>
        current.map((snapshot) =>
          snapshot.id === snapshotId ? result.snapshot : snapshot,
        ),
      )
      if (action === 'run') {
        toast.success('Item started')
      } else if (action === 'kill') {
        toast.success('Item stopped')
      } else {
        toast.success('Item restarted')
      }
      await refresh()
    } catch (actionError) {
      toast.dismiss(loadingId)
      toast.error(
        actionError instanceof Error
          ? actionError.message
          : 'Failed to execute snapshot item action',
      )
    } finally {
      setSnapshotItemActionTarget(null)
      await loadSnapshots()
    }
  }

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col gap-4 p-6">
        <header className="shrink-0 space-y-1">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              DevPort
            </h1>
            <button
              type="button"
              onClick={() =>
                setView((current) =>
                  current === 'processes' ? 'snapshots' : 'processes',
                )
              }
              className="rounded-md border border-violet-600/70 bg-violet-700/40 px-3 py-2 text-sm text-violet-100 transition hover:bg-violet-700/55"
            >
              {view === 'processes' ? 'Snapshots' : 'Back to Processes'}
            </button>
          </div>
          <p className="text-sm text-slate-400">
            View, search, sort, and kill local listening processes on Windows.
          </p>
        </header>

        {view === 'processes' ? (
          <>
            <div className="shrink-0">
              <Toolbar
                search={search}
                onSearchChange={setSearch}
                onRefresh={refresh}
                onKillSelected={handleKillSelected}
                onCreateSnapshot={handleOpenSnapshotModal}
                selectedCount={selectedKeys.length}
                loading={loading || isTerminating}
                terminating={isTerminating}
                creatingSnapshot={creatingSnapshot}
                totalCount={totalCount}
                filteredCount={filteredCount}
                portSortDirection={
                  sortField === 'port' ? sortDirection : 'asc'
                }
                onPortSortDirectionChange={setPortSortDirection}
              />
            </div>

            {loading ? (
              <div className="shrink-0 rounded-md border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
                Refreshing process list...
              </div>
            ) : null}

            <div className="min-h-0 flex-1">
              <ProcessTable
                rows={visibleRows}
                selectedKeys={selectedKeys}
                selectedKey={
                  selectedProcess ? getProcessKey(selectedProcess) : null
                }
                terminatingKey={terminatingKey}
                isTerminating={isTerminating}
                allVisibleSelected={allVisibleSelected}
                onToggleSelectAll={toggleSelectVisible}
                onToggleSelected={toggleSelected}
                onSelectRow={handleSelectRow}
                onKillOne={handleKillOne}
                sortField={sortField}
                sortDirection={sortDirection}
                onSort={toggleSort}
              />
            </div>
          </>
        ) : (
          <SnapshotPage
            snapshots={snapshots}
            loading={snapshotsLoading}
            runningSnapshotId={runningSnapshotId}
            restartingSnapshotId={restartingSnapshotId}
            itemActionTarget={snapshotItemActionTarget}
            onRefresh={loadSnapshots}
            onRunAll={handleRunSnapshot}
            onRestartAll={handleRestartSnapshot}
            onItemAction={handleSnapshotItemAction}
          />
        )}
      </div>

      {selectedProcess && view === 'processes' ? (
        <ProcessDetailPanel
          process={selectedProcess}
          onClose={handleCloseDetail}
          onKill={handleKillOne}
          isTerminating={
            isTerminating &&
            terminatingKey === getProcessKey(selectedProcess)
          }
        />
      ) : null}

      {snapshotModalOpen ? (
        <SnapshotCreateModal
          selectedCount={selectedRows.length}
          selectedProcesses={selectedSnapshotDrafts}
          creating={creatingSnapshot}
          onClose={() => setSnapshotModalOpen(false)}
          onCreate={handleCreateSnapshot}
        />
      ) : null}
    </main>
  )
}

export default App
