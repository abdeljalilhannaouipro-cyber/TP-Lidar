param([string]$OutputDirectory='outputs',[string]$PortName='COM3')
$ErrorActionPreference = 'Stop'
$port = [System.IO.Ports.SerialPort]::new($PortName,115200,[System.IO.Ports.Parity]::None,8,[System.IO.Ports.StopBits]::One)
$port.ReadTimeout = 1000
try {
  $port.Open()
  $deadline = [DateTime]::UtcNow.AddSeconds(20)
  $rows = [System.Collections.Generic.List[string]]::new()
  $started = $false; $complete = $false
  while ([DateTime]::UtcNow -lt $deadline) {
    try { $line = $port.ReadLine().Trim() } catch [System.TimeoutException] { continue }
    if ($line -match '^0,') {
      if ($started -and $rows.Count -gt 100) { $complete = $true; break }
      $rows.Clear(); $started = $true
    }
    if ($started -and $line -match '^\d+,[-+\d.]+,\d+,\d+(,[-+\d.]+,[-+\d.]+)?$') { $rows.Add($line) }
    elseif ($started -and $line -eq '' -and $rows.Count -gt 100) { $complete = $true; break }
  }
  if (-not $complete) { throw 'No complete scan received within 20 seconds.' }
  $columns = $rows[0].Split(',').Count
  for ($i=0; $i -lt $rows.Count; $i++) {
    if ([int]$rows[$i].Split(',')[0] -ne $i -or $rows[$i].Split(',').Count -ne $columns) { throw 'Incomplete scan: inconsistent indices or columns.' }
  }
  $time = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow,'Romance Standard Time')
  $directory = [System.IO.Path]::GetFullPath($OutputDirectory)
  if (-not [System.IO.Directory]::Exists($directory)) { [System.IO.Directory]::CreateDirectory($directory) | Out-Null }
  $output = Join-Path $directory ('scan_'+$time.ToString('yyyyMMdd_HHmmss_ffffff')+'.csv')
  $header = if ($columns -eq 6) { 'point_index,angle_deg,dist_mm,intensity,x_lib_mm,y_lib_mm' } else { 'point_index,angle_deg,dist_mm,intensity' }
  [System.IO.File]::WriteAllLines($output,@($header)+$rows.ToArray())
  Write-Host ('Recorded '+$rows.Count+' points; consecutive indices verified.')
  Write-Output $output
} finally {
  if ($port.IsOpen) { $port.Close() }
  $port.Dispose()
}
