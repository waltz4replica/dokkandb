# Updates tier list / events / banners / news from this PC and uploads them to GitHub.
# Windows runs it every 3 hours through the scheduled task "DokkanDB - actualizar datos"
# (created by scripts/install-task.ps1). DokkanStats blocks GitHub's servers, so this part runs here.
#
# It works in its own copy of the "main" branch (%LOCALAPPDATA%\DokkanDB\data-main), so it never
# touches the folder you work in, whatever branch (main, beta…) you have open there.

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $repo 'logs'
New-Item -ItemType Directory -Force $logDir | Out-Null
$log = Join-Path $logDir 'update.log'
$work = Join-Path $env:LOCALAPPDATA 'DokkanDB\data-main'

function Log($msg) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg" | Out-File -Append -Encoding utf8 $log }

# Tools are installed for all users; make sure this window can find them.
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')

# Native tools write progress and warnings to stderr; only the exit code says whether they failed.
function Run($exe, [string[]]$arguments) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { $out = & $exe @arguments 2>&1 | Out-String } finally { $ErrorActionPreference = $prev }
  if ($LASTEXITCODE -ne 0) { throw "$exe $($arguments -join ' ') failed: $out" }
  return $out
}

try {
  Log 'Start'
  Set-Location $repo
  Run git @('fetch', '--quiet', 'origin') | Out-Null
  if (-not (Test-Path (Join-Path $work '.git'))) {
    New-Item -ItemType Directory -Force (Split-Path $work) | Out-Null
    Run git @('worktree', 'prune') | Out-Null
    Run git @('worktree', 'add', '--detach', $work, 'origin/main') | Out-Null
    Log "Created work copy in $work"
  }
  Set-Location $work
  Run git @('-c', 'core.autocrlf=false', 'reset', '--hard', '--quiet', 'origin/main') | Out-Null
  Log ((Run node @('scripts/scrape.mjs')).Trim() -replace "`r?`n", ' | ')

  if (git status --porcelain -- data/) {
    Run git @('add', 'data/') | Out-Null
    Run git @('-c', 'user.name=waltz4replica', '-c', 'user.email=244011484+waltz4replica@users.noreply.github.com',
      'commit', '--quiet', '-m', 'Datos actualizados desde el PC: tier list, eventos, banners y noticias') | Out-Null
    try { Run git @('push', '--quiet', 'origin', 'HEAD:main') | Out-Null }
    catch {
      # The GitHub job pushed first: put our commit on top of theirs and try once more.
      Run git @('fetch', '--quiet', 'origin') | Out-Null
      Run git @('rebase', '--quiet', 'origin/main') | Out-Null
      Run git @('push', '--quiet', 'origin', 'HEAD:main') | Out-Null
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
