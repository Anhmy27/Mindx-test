import type { SortDirection } from '../types/process'

type ToolbarProps = {
  search: string
  onSearchChange: (value: string) => void
  onRefresh: () => Promise<void>
  onKillSelected: () => Promise<void>
  onCreateSnapshot: () => void
  selectedCount: number
  loading: boolean
  terminating?: boolean
  creatingSnapshot?: boolean
  totalCount: number
  filteredCount: number
  portSortDirection: SortDirection
  onPortSortDirectionChange: (direction: SortDirection) => void
}

export const Toolbar = ({
  search,
  onSearchChange,
  onRefresh,
  onKillSelected,
  onCreateSnapshot,
  selectedCount,
  loading,
  terminating = false,
  creatingSnapshot = false,
  totalCount,
  filteredCount,
  portSortDirection,
  onPortSortDirectionChange,
}: ToolbarProps) => {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/95 p-4 shadow-lg shadow-slate-950/40 backdrop-blur md:flex-row md:items-center">
      <div className="flex w-full flex-col gap-2 md:max-w-xl">
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by port, PID, process name..."
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-violet-400"
        />
        <p className="text-sm text-slate-300">
          Total processes: <span className="text-base font-semibold text-slate-100">{totalCount}</span>
          {' · '}
          Showing: <span className="text-base font-semibold text-slate-100">{filteredCount}</span>
        </p>
      </div>

      <div className="flex flex-wrap gap-2 md:ml-auto">
        <select
          value={portSortDirection}
          onChange={(event) =>
            onPortSortDirectionChange(event.target.value as SortDirection)
          }
          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none transition hover:border-slate-500"
          title="Sort by port"
        >
          <option value="asc">Port: Low to High</option>
          <option value="desc">Port: High to Low</option>
        </select>
        <button
          type="button"
          onClick={() => void onRefresh()}
          disabled={loading}
          className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={() => void onKillSelected()}
          disabled={selectedCount === 0 || loading}
          className="rounded-md border border-rose-600/70 bg-rose-700/40 px-3 py-2 text-sm text-rose-100 transition hover:bg-rose-700/60 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {terminating ? 'Killing...' : `Kill Selected (${selectedCount})`}
        </button>
        <button
          type="button"
          onClick={onCreateSnapshot}
          disabled={selectedCount === 0 || loading || creatingSnapshot}
          className="rounded-md border border-violet-600/70 bg-violet-700/35 px-3 py-2 text-sm text-violet-100 transition hover:bg-violet-700/55 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {creatingSnapshot
            ? 'Creating...'
            : `Create Snapshot (${selectedCount})`}
        </button>
      </div>
    </div>
  )
}
