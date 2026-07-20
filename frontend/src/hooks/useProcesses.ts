import { useCallback, useEffect, useMemo, useState } from 'react'
import { processService } from '../services/processService'
import {
  canTerminateProcess,
  type GroupedProcessRow,
  type ProcessRow,
  type SortDirection,
  type SortField,
} from '../types/process'
import { groupProcesses } from '../utils/groupProcesses'
import { getProcessKey } from '../utils/processKey'

const matchesSearch = (row: ProcessRow, search: string) => {
  const q = search.trim().toLowerCase()
  if (!q) {
    return true
  }

  return (
    row.port.toString().includes(q) ||
    row.pid.toString().includes(q) ||
    (row.processName ?? '').toLowerCase().includes(q) ||
    (row.containerName ?? '').toLowerCase().includes(q)
  )
}

const compareRows = (
  a: GroupedProcessRow,
  b: GroupedProcessRow,
  field: SortField,
  direction: SortDirection,
) => {
  const factor = direction === 'asc' ? 1 : -1

  if (field === 'processName') {
    const aName = (a.processName ?? '').toLowerCase()
    const bName = (b.processName ?? '').toLowerCase()
    return aName.localeCompare(bName) * factor
  }

  return (a[field] - b[field]) * factor
}

export const useProcesses = () => {
  const [rows, setRows] = useState<ProcessRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [sortField, setSortField] = useState<SortField>('port')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await processService.list()
      setRows(data)
      setSelectedKeys((current) =>
        current.filter((key) =>
          groupProcesses(data).some(
            (row) => getProcessKey(row) === key && canTerminateProcess(row),
          ),
        ),
      )
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : 'Cannot fetch process list',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const groupedRows = useMemo(() => groupProcesses(rows), [rows])

  const visibleRows = useMemo(() => {
    const filtered = rows.filter((row) => matchesSearch(row, search))
    return groupProcesses(filtered).sort((a, b) =>
      compareRows(a, b, sortField, sortDirection),
    )
  }, [rows, search, sortField, sortDirection])

  const killableVisibleRows = useMemo(
    () => visibleRows.filter((row) => canTerminateProcess(row)),
    [visibleRows],
  )

  const selectedRows = useMemo(
    () =>
      groupedRows.filter((row) => selectedKeys.includes(getProcessKey(row))),
    [groupedRows, selectedKeys],
  )

  const allVisibleSelected =
    killableVisibleRows.length > 0 &&
    killableVisibleRows.every((row) =>
      selectedKeys.includes(getProcessKey(row)),
    )

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortField(field)
    setSortDirection('asc')
  }

  const setPortSortDirection = (direction: SortDirection) => {
    setSortField('port')
    setSortDirection(direction)
  }

  const toggleSelected = (row: GroupedProcessRow) => {
    if (!canTerminateProcess(row)) {
      return
    }

    const key = getProcessKey(row)
    setSelectedKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    )
  }

  const toggleSelectVisible = () => {
    if (allVisibleSelected) {
      setSelectedKeys((current) =>
        current.filter(
          (key) => !killableVisibleRows.some((row) => getProcessKey(row) === key),
        ),
      )
      return
    }

    setSelectedKeys((current) => {
      const merged = new Set(current)
      killableVisibleRows.forEach((row) => merged.add(getProcessKey(row)))
      return Array.from(merged)
    })
  }

  const killOne = async (row: GroupedProcessRow) => {
    if (!canTerminateProcess(row)) {
      throw new Error(`PID ${row.pid} is a protected system process`)
    }

    const result = await processService.killOne(row.pid, row.port)
    await refresh()
    return result
  }

  const killSelected = async () => {
    const items = selectedRows
      .filter((row) => canTerminateProcess(row))
      .map((row) => ({ pid: row.pid, port: row.port }))

    if (items.length === 0) {
      return { killed: [], failed: [] }
    }

    const result = await processService.killMultiple(items)
    setSelectedKeys([])
    await refresh()
    return result
  }

  const clearSelection = () => {
    setSelectedKeys([])
  }

  return {
    rows,
    visibleRows,
    totalCount: groupedRows.length,
    filteredCount: visibleRows.length,
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
  }
}
