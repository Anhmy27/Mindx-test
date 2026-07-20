import { useEffect, useMemo, useState } from 'react'

type SnapshotProcessDraft = {
  key: string
  pid: number
  port: number
  processName: string
  isContainer: boolean
}

type SnapshotCreateModalProps = {
  selectedCount: number
  selectedProcesses: SnapshotProcessDraft[]
  creating: boolean
  onClose: () => void
  onCreate: (name: string, scripts: Record<string, string>) => Promise<void>
}

const buildDefaultName = () =>
  `snapshot-${new Date().toISOString().replace('T', ' ').slice(0, 19)}`

export const SnapshotCreateModal = ({
  selectedCount,
  selectedProcesses,
  creating,
  onClose,
  onCreate,
}: SnapshotCreateModalProps) => {
  const [name, setName] = useState('')
  const [scripts, setScripts] = useState<Record<string, string>>({})

  useEffect(() => {
    setName(buildDefaultName())
    setScripts({})
  }, [])

  const trimmedName = useMemo(() => name.trim(), [name])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !creating) {
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [creating, onClose])

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={() => {
        if (!creating) {
          onClose()
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-white">Create Snapshot</h2>
        <p className="mt-1 text-sm text-slate-400">
          Save {selectedCount} selected process
          {selectedCount > 1 ? 'es' : ''} as a snapshot.
        </p>

        <label className="mt-4 block text-sm text-slate-300">
          Snapshot name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Enter snapshot name"
            autoFocus
            disabled={creating}
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-violet-400 disabled:opacity-60"
          />
        </label>

        <div className="mt-4 space-y-2">
          <p className="text-sm text-slate-300">
            Optional script per process (for reliable rerun). If empty, snapshot
            uses current behavior.
          </p>
          <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border border-slate-800 bg-slate-950/50 p-3">
            {selectedProcesses.map((process) => (
              <div
                key={process.key}
                className="rounded-md border border-slate-800 bg-slate-900/60 p-3"
              >
                <p className="text-sm font-medium text-slate-100">
                  {process.processName}
                  <span className="ml-2 text-xs text-slate-400">
                    PID {process.pid} · Port {process.port}
                  </span>
                </p>
                {process.isContainer ? (
                  <p className="mt-1 text-xs text-slate-500">
                    Docker container item ignores script (uses docker start).
                  </p>
                ) : (
                  <input
                    value={scripts[process.key] ?? ''}
                    onChange={(event) =>
                      setScripts((current) => ({
                        ...current,
                        [process.key]: event.target.value,
                      }))
                    }
                    disabled={creating}
                    placeholder="e.g. npm run dev"
                    className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-violet-400 disabled:opacity-60"
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={creating}
            className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!trimmedName || creating}
            onClick={() => void onCreate(trimmedName, scripts)}
            className="rounded-md border border-violet-600/70 bg-violet-700/50 px-4 py-2 text-sm text-violet-50 transition hover:bg-violet-700/70 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
