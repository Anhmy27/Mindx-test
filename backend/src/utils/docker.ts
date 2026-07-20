import { runCommand } from './command.js'

export type DockerContainerInfo = { id: string; name: string; ports: number[] }

type DockerInspect = {
  Id?: string
  Name?: string
  NetworkSettings?: {
    Ports?: Record<string, { HostPort?: string }[] | null>
  }
}

export const listDockerContainers = async (): Promise<DockerContainerInfo[]> => {
  try {
    const idsOutput = await runCommand('docker', ['ps', '-q'])
    const ids = idsOutput
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)

    if (ids.length === 0) {
      return []
    }

    const inspectOutput = await runCommand('docker', [
      'inspect',
      ...ids,
    ])

    const inspected = JSON.parse(inspectOutput) as DockerInspect[]

    return inspected.map((container) => {
      const hostPorts = new Set<number>()
      const portBindings = container.NetworkSettings?.Ports ?? {}

      for (const bindings of Object.values(portBindings)) {
        if (!bindings) {
          continue
        }

        for (const binding of bindings) {
          const hostPort = Number(binding.HostPort)
          if (Number.isInteger(hostPort) && hostPort > 0) {
            hostPorts.add(hostPort)
          }
        }
      }

      return {
        id: container.Id ?? '',
        name: (container.Name ?? '').replace(/^\//, ''),
        ports: Array.from(hostPorts).sort((a, b) => a - b),
      }
    }).filter((container) => Boolean(container.id) && Boolean(container.name))
  } catch {
    return []
  }
}

export const buildPortToContainerMap = (
  containers: DockerContainerInfo[],
): Map<number, { id: string; name: string }> => {
  const map = new Map<number, { id: string; name: string }>()

  for (const container of containers) {
    for (const port of container.ports) {
      if (!map.has(port)) {
        map.set(port, { id: container.id, name: container.name })
      }
    }
  }

  return map
}

export const stopDockerContainer = async (containerId: string): Promise<void> => {
  await runCommand('docker', ['stop', containerId])
}
