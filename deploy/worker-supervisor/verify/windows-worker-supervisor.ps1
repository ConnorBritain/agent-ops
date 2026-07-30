[CmdletBinding()]
param(
  [string]$ServiceName = 'AgentOpsWorkerSupervisor',
  [string]$DefinitionPath = "$env:ProgramData\AgentOps\current\AgentOpsWorkerSupervisor.xml"
)

$service = Get-CimInstance Win32_Service -Filter "Name='$ServiceName'"
if ($null -eq $service) { throw "Missing service: $ServiceName" }
if ($service.StartMode -ne 'Auto') { throw 'Worker supervisor must be automatic.' }
if ($service.State -ne 'Running') { throw 'Worker supervisor must be running.' }
if ($service.StartName -match 'LocalSystem|LocalService|NetworkService') {
  throw 'Worker supervisor must use a dedicated approved service account.'
}

$definition = Get-Content -Raw -LiteralPath $DefinitionPath
foreach ($required in @('<startmode>Automatic</startmode>', 'supervisor-only', '<interactive>false</interactive>')) {
  if (-not $definition.Contains($required)) { throw "Missing required definition value: $required" }
}
if ($definition -match '(?i)<download|resume.*(agent|workload)|provider.*start') {
  throw 'Worker service definition must not download, resume workloads, or start providers.'
}
