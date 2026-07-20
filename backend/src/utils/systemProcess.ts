const SYSTEM_PROCESS_NAMES = new Set([
  'system',
  'idle',
  'registry',
  'smss.exe',
  'csrss.exe',
  'wininit.exe',
  'services.exe',
  'lsass.exe',
  'winlogon.exe',
  'svchost.exe',
  'fontdrvhost.exe',
  'dwm.exe',
  'memory compression',
  'secure system',
  'lsm.exe',
  'spoolsv.exe',
  'searchindexer.exe',
  'searchprotocolhost.exe',
  'wmiprvse.exe',
  'taskhostw.exe',
  'sihost.exe',
  'runtimebroker.exe',
  'ctfmon.exe',
  'conhost.exe',
  'dllhost.exe',
  'explorer.exe',
])

const windowsRoot = (
  process.env.SystemRoot ||
  process.env.WINDIR ||
  'C:\\Windows'
).toLowerCase()

export type SystemProcessIdentity = {
  pid: number
  processName?: string | null
  executablePath?: string | null
}

export const isSystemProcess = (identity: SystemProcessIdentity): boolean => {
  if (identity.pid <= 4) {
    return true
  }

  const processName = (identity.processName ?? '').trim().toLowerCase()
  if (processName && SYSTEM_PROCESS_NAMES.has(processName)) {
    return true
  }

  const executablePath = (identity.executablePath ?? '').trim().toLowerCase()
  if (executablePath.startsWith(`${windowsRoot}\\`)) {
    return true
  }

  return false
}
