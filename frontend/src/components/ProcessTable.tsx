import { Fragment, useEffect, useState } from 'react'
import {
  canTerminateProcess,
  type GroupedProcessRow,
  type SortDirection,
  type SortField,
} from '../types/process'
import { getProcessKey } from '../utils/processKey'

export { getProcessKey }

type ProcessTableProps = {
  rows: GroupedProcessRow[]
  selectedKeys: string[]
  selectedKey: string | null
  terminatingKey: string | null
  isTerminating: boolean
  allVisibleSelected: boolean
  onToggleSelectAll: () => void
  onToggleSelected: (row: GroupedProcessRow) => void
  onSelectRow: (row: GroupedProcessRow) => void
  onKillOne: (row: GroupedProcessRow) => Promise<void>
  sortField: SortField
  sortDirection: SortDirection
  onSort: (field: SortField) => void
}

const SortableHeader = ({
  label,
  field,
  activeField,
  direction,
  onSort,
}: {
  label: string
  field: SortField
  activeField: SortField
  direction: SortDirection
  onSort: (field: SortField) => void
}) => {
  const indicator = activeField === field ? (direction === 'asc' ? '↑' : '↓') : ''

  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className="inline-flex items-center gap-1 font-semibold text-slate-200 transition hover:text-white"
    >
      {label}
      <span className="w-3 text-xs text-violet-300">{indicator}</span>
    </button>
  )
}

export const ProcessTable = ({
  rows,
  selectedKeys,
  selectedKey,
  terminatingKey,
  isTerminating,
  allVisibleSelected,
  onToggleSelectAll,
  onToggleSelected,
  onSelectRow,
  onKillOne,
  sortField,
  sortDirection,
  onSort,
}: ProcessTableProps) => {
  const [expandedKeys, setExpandedKeys] = useState<string[]>([])

  useEffect(() => {
    const validKeys = new Set(rows.map((row) => getProcessKey(row)))
    setExpandedKeys((current) => current.filter((key) => validKeys.has(key)))
  }, [rows])

  const toggleExpanded = (rowKey: string) => {
    setExpandedKeys((current) =>
      current.includes(rowKey)
        ? current.filter((key) => key !== rowKey)
        : [...current, rowKey],
    )
  }

  return (
    <div className="h-full overflow-auto rounded-xl border border-slate-800 bg-slate-900/50">
      <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
        <thead className="sticky top-0 z-10 bg-slate-900 text-slate-300 shadow-[0_1px_0_0_rgb(30_41_59)]">
          <tr>
            <th className="px-4 py-3">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={onToggleSelectAll}
              />
            </th>
            <th className="px-4 py-3">
              <SortableHeader
                label="Port"
                field="port"
                activeField={sortField}
                direction={sortDirection}
                onSort={onSort}
              />
            </th>
            <th className="px-4 py-3">
              <SortableHeader
                label="PID"
                field="pid"
                activeField={sortField}
                direction={sortDirection}
                onSort={onSort}
              />
            </th>
            <th className="px-4 py-3">
              <SortableHeader
                label="Process"
                field="processName"
                activeField={sortField}
                direction={sortDirection}
                onSort={onSort}
              />
            </th>
            <th className="px-4 py-3">Container</th>
            <th className="px-4 py-3">Protocol</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Command</th>
            <th className="px-4 py-3">Working Directory</th>
            <th className="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800 text-slate-100">
          {rows.map((row) => {
            const rowKey = getProcessKey(row)
            const isSelected = selectedKey === rowKey
            const canTerminate = canTerminateProcess(row)
            const isGroup = row.processes.length > 1
            const isExpanded = isGroup && expandedKeys.includes(rowKey)
            const isRowTerminating = terminatingKey === rowKey

            return (
              <Fragment key={rowKey}>
                <tr
                  onClick={() => onSelectRow(row)}
                  className={`cursor-pointer transition hover:bg-slate-800/60 ${
                    isSelected ? 'bg-violet-500/10' : ''
                  }`}
                >
                  <td
                    className="px-4 py-3"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {canTerminate ? (
                      <input
                        type="checkbox"
                        checked={selectedKeys.includes(rowKey)}
                        onChange={() => onToggleSelected(row)}
                      />
                    ) : (
                      <span className="text-xs text-slate-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5">
                      {isGroup ? (
                        <button
                          type="button"
                          aria-label={
                            isExpanded
                              ? 'Collapse host processes'
                              : 'Expand host processes'
                          }
                          aria-expanded={isExpanded}
                          onClick={(event) => {
                            event.stopPropagation()
                            toggleExpanded(rowKey)
                          }}
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-800/80 text-base leading-none text-slate-200 transition hover:border-slate-500 hover:bg-slate-700 hover:text-white"
                        >
                          {isExpanded ? '▾' : '▸'}
                        </button>
                      ) : (
                        <span className="inline-block h-7 w-7" aria-hidden />
                      )}
                      {row.port}
                    </span>
                  </td>
                  <td className="px-4 py-3">{row.pid}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span>{row.processName ?? 'N/A'}</span>
                      {row.isSystemProcess && !row.containerId ? (
                        <span className="rounded-full bg-slate-700/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
                          System
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {row.containerName ?? '—'}
                  </td>
                  <td className="px-4 py-3">{row.protocol}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-xs text-emerald-300">
                      {row.status}
                    </span>
                  </td>
                  <td
                    className="max-w-xs truncate px-4 py-3 text-slate-300"
                    title={row.commandLine ?? ''}
                  >
                    {row.commandLine ?? 'N/A'}
                  </td>
                  <td
                    className="max-w-xs truncate px-4 py-3 text-slate-300"
                    title={row.workingDirectory ?? ''}
                  >
                    {row.workingDirectory ?? 'N/A'}
                  </td>
                  <td
                    className="px-4 py-3"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {canTerminate ? (
                      <button
                        type="button"
                        disabled={isTerminating}
                        onClick={() => void onKillOne(row)}
                        className="rounded-md border border-rose-600/70 bg-rose-700/30 px-3 py-1.5 text-xs text-rose-100 transition hover:bg-rose-700/50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isRowTerminating
                          ? row.containerId
                            ? 'Stopping...'
                            : 'Killing...'
                          : row.containerId
                            ? 'Stop container'
                            : 'Kill'}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-500">View only</span>
                    )}
                  </td>
                </tr>

                {isExpanded
                  ? row.processes
                      .filter((host) => host.pid !== row.pid)
                      .map((host) => (
                        <tr
                          key={`${rowKey}-host-${host.pid}`}
                          className="bg-slate-950/80 text-slate-300"
                        >
                          <td className="px-4 py-3" />
                          <td className="px-4 py-3 pl-11 text-slate-500">↳</td>
                          <td className="px-4 py-3">{host.pid}</td>
                          <td className="px-4 py-3">
                            {host.processName ?? 'N/A'}
                          </td>
                          <td className="px-4 py-3 text-slate-300">
                            {row.containerName ?? '—'}
                          </td>
                          <td className="px-4 py-3">{host.protocol}</td>
                          <td className="px-4 py-3">
                            <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300/80">
                              {host.status}
                            </span>
                          </td>
                          <td
                            className="max-w-xs truncate px-4 py-3 text-slate-400"
                            title={host.commandLine ?? ''}
                          >
                            {host.commandLine ?? 'N/A'}
                          </td>
                          <td
                            className="max-w-xs truncate px-4 py-3 text-slate-400"
                            title={host.workingDirectory ?? ''}
                          >
                            {host.workingDirectory ?? 'N/A'}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            —
                          </td>
                        </tr>
                      ))
                  : null}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
