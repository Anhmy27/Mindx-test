$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class ProcessWorkingDirectory
{
    private const int PROCESS_QUERY_INFORMATION = 0x0400;
    private const int PROCESS_VM_READ = 0x0010;

    [StructLayout(LayoutKind.Sequential)]
    private struct PROCESS_BASIC_INFORMATION
    {
        public IntPtr Reserved1;
        public IntPtr PebBaseAddress;
        public IntPtr Reserved2_0;
        public IntPtr Reserved2_1;
        public IntPtr UniqueProcessId;
        public IntPtr Reserved3;
    }

    [DllImport("ntdll.dll")]
    private static extern int NtQueryInformationProcess(
        IntPtr processHandle,
        int processInformationClass,
        ref PROCESS_BASIC_INFORMATION processInformation,
        int processInformationLength,
        out int returnLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(int dwDesiredAccess, bool bInheritHandle, int dwProcessId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool ReadProcessMemory(
        IntPtr hProcess,
        IntPtr lpBaseAddress,
        [Out] byte[] lpBuffer,
        int dwSize,
        out IntPtr lpNumberOfBytesRead);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CloseHandle(IntPtr hObject);

    public static string Get(int processId)
    {
        IntPtr hProcess = IntPtr.Zero;
        try
        {
            hProcess = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, processId);
            if (hProcess == IntPtr.Zero)
            {
                return null;
            }

            PROCESS_BASIC_INFORMATION pbi = new PROCESS_BASIC_INFORMATION();
            int returnLength;
            int status = NtQueryInformationProcess(
                hProcess,
                0,
                ref pbi,
                Marshal.SizeOf(typeof(PROCESS_BASIC_INFORMATION)),
                out returnLength);

            if (status != 0 || pbi.PebBaseAddress == IntPtr.Zero)
            {
                return null;
            }

            bool is64 = IntPtr.Size == 8;
            int processParametersOffset = is64 ? 0x20 : 0x10;
            int currentDirectoryOffset = is64 ? 0x38 : 0x24;
            int bufferOffsetInUnicodeString = is64 ? 8 : 4;

            byte[] pointerBytes = new byte[IntPtr.Size];
            IntPtr bytesRead;
            if (!ReadProcessMemory(
                hProcess,
                IntPtr.Add(pbi.PebBaseAddress, processParametersOffset),
                pointerBytes,
                pointerBytes.Length,
                out bytesRead))
            {
                return null;
            }

            IntPtr processParameters = BytesToIntPtr(pointerBytes);
            if (processParameters == IntPtr.Zero)
            {
                return null;
            }

            byte[] unicodeString = new byte[is64 ? 16 : 8];
            if (!ReadProcessMemory(
                hProcess,
                IntPtr.Add(processParameters, currentDirectoryOffset),
                unicodeString,
                unicodeString.Length,
                out bytesRead))
            {
                return null;
            }

            short length = BitConverter.ToInt16(unicodeString, 0);
            if (length <= 0)
            {
                return null;
            }

            IntPtr bufferPtr = BytesToIntPtr(unicodeString, bufferOffsetInUnicodeString);
            if (bufferPtr == IntPtr.Zero)
            {
                return null;
            }

            byte[] pathBytes = new byte[length];
            if (!ReadProcessMemory(hProcess, bufferPtr, pathBytes, pathBytes.Length, out bytesRead))
            {
                return null;
            }

            return Encoding.Unicode.GetString(pathBytes).TrimEnd('\\');
        }
        catch
        {
            return null;
        }
        finally
        {
            if (hProcess != IntPtr.Zero)
            {
                CloseHandle(hProcess);
            }
        }
    }

    private static IntPtr BytesToIntPtr(byte[] bytes, int offset = 0)
    {
        if (IntPtr.Size == 8)
        {
            return new IntPtr(BitConverter.ToInt64(bytes, offset));
        }

        return new IntPtr(BitConverter.ToInt32(bytes, offset));
    }
}
"@

$tcp = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Select-Object LocalPort, OwningProcess, @{ Name = 'Protocol'; Expression = { 'TCP' } }

$udp = Get-NetUDPEndpoint -ErrorAction SilentlyContinue |
  Select-Object LocalPort, OwningProcess, @{ Name = 'Protocol'; Expression = { 'UDP' } }

$listeners = @($tcp) + @($udp)
$pidSet = [System.Collections.Generic.HashSet[int]]::new()
foreach ($listenerPid in @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)) {
  [void]$pidSet.Add([int]$listenerPid)
}

$processMap = @{}
Get-CimInstance Win32_Process | ForEach-Object {
  $processId = [int]$_.ProcessId
  if ($pidSet.Contains($processId)) {
    $processMap[$processId] = $_
  }
}

$cwdCache = @{}

$result = foreach ($listener in $listeners) {
  $pidValue = [int]$listener.OwningProcess
  $proc = $processMap[$pidValue]

  if (-not $cwdCache.ContainsKey($pidValue)) {
    try {
      $cwdCache[$pidValue] = [ProcessWorkingDirectory]::Get($pidValue)
    }
    catch {
      $cwdCache[$pidValue] = $null
    }
  }

  [PSCustomObject]@{
    pid = $pidValue
    port = [int]$listener.LocalPort
    processName = if ($proc) { $proc.Name } else { $null }
    commandLine = if ($proc) { $proc.CommandLine } else { $null }
    workingDirectory = $cwdCache[$pidValue]
    executablePath = if ($proc) { $proc.ExecutablePath } else { $null }
    protocol = $listener.Protocol
    status = 'LISTENING'
  }
}

$result |
  Sort-Object protocol, port, pid -Unique |
  ConvertTo-Json -Depth 4
