# Updates tier list / events / news from this PC and uploads them to GitHub.
# Windows runs it every 3 hours through the scheduled task "DokkanDB - actualizar datos"
# (created by scripts/install-task.ps1). DokkanStats blocks GitHub's servers, so this part runs here.

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $repo 'logs'
New-Item -ItemType Directory -Force $logDir | Out-Null
$log = Join-Path $logDir 'update.log'

function Log($msg) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg" | Out-File -Append -Encoding utf8 $log }

# Tools are installed for all users; make sure this window can find them.
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')

# Native tools write progress to stderr; don't treat that as a failure.
function Run($exe, [string[]]$arguments) {
  $out = & $exe @arguments 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) { throw "$exe $($arguments -join ' ') failed: $out" }
  return $out
}

Set-Location $repo
try {
  Log 'Start'
  Run git @('pull', '--rebase', '--autostash', '--quiet') | Out-Null
  Log ((Run node @('scripts/scrape.mjs')).Trim() -replace "`r?`n", ' | ')

  if (git status --porcelain -- data/) {
    Run git @('add', 'data/') | Out-Null
    Run git @('commit', '--quiet', '-m', 'Datos actualizados desde el PC: tier list, eventos y noticias') | Out-Null
    try { Run git @('push', '--quiet') | Out-Null }
    catch {
      # Someone else (the GitHub job) pushed first: catch up and try once more.
      Run git @('pull', '--rebase', '--quiet') | Out-Null
      Run git @('push', '--quiet') | Out-Null
    }
    Log 'Uploaded to GitHub'
  } else {
    Log 'No changes'
  }
} catch {
  Log "ERROR: $($_.Exception.Message)"
  exit 1
}

# Keep the log small.
$lines = Get-Content $log -ErrorAction SilentlyContinue
if ($lines.Count -gt 500) { $lines | Select-Object -Last 300 | Set-Content -Encoding utf8 $log }
