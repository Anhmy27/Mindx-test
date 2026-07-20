import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export const runCommand = async (
  command: string,
  args: string[],
): Promise<string> => {
  const { stdout } = await execFileAsync(command, args, {
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 20,
  })

  return stdout
}
