import { useEffect } from 'react'
import {
  canTerminateProcess,
  type GroupedProcessRow,
} from '../types/process'

type ProcessDetailPanelProps = {
  process: GroupedProcessRow
  onClose: () => void
  onKill: (row: GroupedProcessRow) => Promise<void>
  isTerminating?: boolean
}

const DetailField = ({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) => {
  return (
    <div className="space-y-1 border-b border-slate-800/80 pb-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p
        className={`break-all text-sm text-slate-100 ${mono ? 'font-mono text-[13px] leading-relaxed text-slate-200' : ''}`}
      >
        {value}
      </p>
    </div>
  )
}

export const ProcessDetailPanel = ({
  process,
  onClose,
  onKill,
  isTerminating = false,
}: ProcessDetailPanelProps) => {
  const canTerminate = canTerminateProcess(process)
  const hostCount = process.processes.length
  const pids = process.processes.map((host) => host.pid).join(', ')

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isTerminating) {
        onClose()
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isTerminating, onClose])

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      onClick={() => {
        if (!isTerminating) {
          onClose()
        }
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="process-detail-title"
        className="flex max-h-[min(88vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 border-b border-slate-800 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Process detail
              </p>
              <h2
                id="process-detail-title"
                className="mt-1 truncate text-lg font-semibold text-white"
              >
                {process.containerName ??
                  process.processName ??
                  'Unknown process'}
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Port {process.port} · PID {pids}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isTerminating}
              className="rounded-md border border-slate-700 px-2.5 py-1 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Close
            </button>
          </div>

          {canTerminate ? (
            <button
              type="button"
              disabled={isTerminating}
              onClick={() => void onKill(process)}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md border border-rose-600/70 bg-rose-700/40 px-3 py-2.5 text-sm text-rose-100 transition hover:bg-rose-700/60 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isTerminating ? (
                <>
                  <span
                    className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-rose-100/30 border-t-rose-100"
                    aria-hidden
                  />
                  {process.containerId ? 'Stopping...' : 'Killing...'}
                </>
              ) : process.containerId ? (
                'Stop container'
              ) : (
                'Kill process'
              )}
            </button>
          ) : (
            <div className="mt-4 rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm text-slate-300">
              System process is view-only and cannot be killed.
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <DetailField label="Port" value={String(process.port)} />
          <DetailField label="PID" value={pids} />
          <DetailField
            label="Docker container"
            value={process.containerName ?? 'N/A'}
          />
          <DetailField label="Protocol" value={process.protocol} />
          <div className="space-y-1 border-b border-slate-800/80 pb-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Status
            </p>
            <span className="inline-flex rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs text-emerald-300">
              {process.status}
            </span>
          </div>

          {hostCount > 1 ? (
            <div className="space-y-2 border-b border-slate-800/80 pb-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Processes
              </p>
              <ul className="space-y-2">
                {process.processes.map((host) => (
                  <li
                    key={`${host.protocol}-${host.port}-${host.pid}`}
                    className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2"
                  >
                    <p className="text-sm font-medium text-slate-100">
                      {host.processName ?? 'N/A'}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-slate-400">
                      PID {host.pid}
                    </p>
                    <p
                      className="mt-1 truncate font-mono text-[11px] text-slate-500"
                      title={host.commandLine ?? undefined}
                    >
                      {host.commandLine ?? 'N/A'}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <DetailField
                label="Process name"
                value={process.processName ?? 'N/A'}
              />
              <DetailField
                label="Command line"
                value={process.commandLine ?? 'N/A'}
                mono
              />
              <DetailField
                label="Working directory"
                value={process.workingDirectory ?? 'N/A'}
                mono
              />
            </>
          )}

          <DetailField
            label="Protected"
            value={
              process.isSystemProcess && !process.containerId
                ? 'Yes (system process)'
                : 'No'
            }
          />
        </div>
      </div>
    </div>
  )
}
