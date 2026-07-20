import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import type { Snapshot } from '../types/process.js'

const snapshotsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../Snapshot',
)

const isSnapshot = (value: unknown): value is Snapshot => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const snapshot = value as Partial<Snapshot>
  return (
    typeof snapshot.id === 'string' &&
    typeof snapshot.name === 'string' &&
    typeof snapshot.createdAt === 'string' &&
    Array.isArray(snapshot.items)
  )
}

export const ensureSnapshotDir = async () => {
  await mkdir(snapshotsDir, { recursive: true })
}

export const listSnapshotsFromDisk = async (): Promise<Snapshot[]> => {
  await ensureSnapshotDir()
  const files = await readdir(snapshotsDir)
  const jsonFiles = files.filter((file) => file.toLowerCase().endsWith('.json'))

  const snapshots: Snapshot[] = []

  for (const file of jsonFiles) {
    try {
      const fullPath = path.join(snapshotsDir, file)
      const content = await readFile(fullPath, 'utf8')
      const parsed = JSON.parse(content) as unknown
      if (isSnapshot(parsed)) {
        snapshots.push(parsed)
      }
    } catch {
      // Ignore malformed snapshot file and continue.
    }
  }

  return snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export const writeSnapshotToDisk = async (snapshot: Snapshot): Promise<void> => {
  await ensureSnapshotDir()
  const safeId = snapshot.id.replace(/[^a-zA-Z0-9._-]/g, '_')
  const fullPath = path.join(snapshotsDir, `${safeId}.json`)

  await writeFile(fullPath, JSON.stringify(snapshot, null, 2), 'utf8')
}
