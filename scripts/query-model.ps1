# Run a DAX or DMV query against the open Power BI Desktop model.
# Usage (Windows PowerShell 5.1):  powershell -File scripts\query-model.ps1 -Query "EVALUATE ROW(""x"", [Net Sales])"
param(
  [string]$Query,
  [string]$QueryFile,
  [int]$Port = 0,
  [string]$OutJson   # optional: write rows as JSON instead of printing a table
)
$ErrorActionPreference = 'Stop'
if ($QueryFile) { $Query = Get-Content $QueryFile -Raw }
Add-Type -Path "C:\Program Files\Microsoft Power BI Desktop\bin\Microsoft.PowerBI.AdomdClient.dll"
if ($Port -eq 0) {
  $ws = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\Power BI Desktop\AnalysisServicesWorkspaces" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  $Port = [int]((Get-Content (Join-Path $ws.FullName 'Data\msmdsrv.port.txt') -Raw) -replace "`0", '')
}
$conn = New-Object Microsoft.AnalysisServices.AdomdClient.AdomdConnection("Data Source=localhost:$Port")
$conn.Open()
try {
  $cmd = $conn.CreateCommand(); $cmd.CommandText = $Query
  $rdr = $cmd.ExecuteReader()
  $rows = @()
  while ($rdr.Read()) {
    $o = [ordered]@{}
    for ($i = 0; $i -lt $rdr.FieldCount; $i++) { $o[$rdr.GetName($i)] = $rdr.GetValue($i) }
    $rows += [pscustomobject]$o
  }
  $rdr.Close()
  if ($OutJson) {
    # column names like Sales[Channel] become Channel; dates become yyyy-MM-dd
    $clean = $rows | % { $o = [ordered]@{}; foreach ($p in $_.PSObject.Properties) { $k = $p.Name -replace '^.*\[(.*)\]$', '$1'; $v = $p.Value; if ($v -is [datetime]) { $v = $v.ToString('yyyy-MM-dd') } elseif ($v -is [System.DBNull]) { $v = $null }; $o[$k] = $v }; [pscustomobject]$o }
    [IO.File]::WriteAllText($OutJson, (ConvertTo-Json @($clean) -Depth 3 -Compress))
    "Wrote $($rows.Count) rows to $OutJson"
  } else {
    $rows | Format-Table -AutoSize | Out-String -Width 250
  }
} finally { $conn.Close() }
