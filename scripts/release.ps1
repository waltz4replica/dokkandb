<#
Publica una versión de DokkanDB. Ver RELEASING.md.

  Beta (funciones nuevas, para probar):
    .\scripts\release.ps1 beta                 # 2.7.0-beta.1, 2.7.0-beta.2, ...
    .\scripts\release.ps1 beta -Bump major     # empieza una beta de 3.0.0

  Estable:
    .\scripts\release.ps1 stable -FromBeta     # pasa la beta a estable (2.7.0-beta.3 -> 2.7.0)
    .\scripts\release.ps1 stable -Notes "Corregido: ...", "Corregido: ..."   # corrección directa (2.6.1 -> 2.6.2)

  Volver atrás (la web estable vuelve a una versión anterior hasta la siguiente publicación):
    .\scripts\release.ps1 rollback -To v2.6.0

Antes de publicar: el trabajo debe estar guardado en commits (sin cambios sueltos).
Las notas de las funciones que están en beta se escriben en NEXT.md.
#>
param(
  [Parameter(Mandatory = $true, Position = 0)][ValidateSet('beta', 'stable', 'rollback')][string]$Action,
  [ValidateSet('patch', 'minor', 'major')][string]$Bump,
  [switch]$FromBeta,
  [string[]]$Notes,
  [string]$To,
  [switch]$SkipChecks,
  [switch]$NoWait
)

$ErrorActionPreference = 'Stop'
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$Utf8 = New-Object Text.UTF8Encoding $false
$Site = 'https://waltz4replica.github.io/dokkandb/'
$VersionFiles = @('js/version.js', 'sw.js', 'package.json')
$GitName = 'waltz4replica'
$GitEmail = '244011484+waltz4replica@users.noreply.github.com'

function Run { param([string]$Exe) $a = $args; & $Exe @a; if ($LASTEXITCODE) { throw "$Exe $($a -join ' ') falló (código $LASTEXITCODE)" } }
function G { $a = $args; & git @a; if ($LASTEXITCODE) { throw "git $($a -join ' ') falló" } }
function Commit([string]$msg) { G -c "user.name=$GitName" -c "user.email=$GitEmail" commit -q -m "$msg`n`nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" }
function ReadText([string]$p) { [IO.File]::ReadAllText((Join-Path $Root $p), $Utf8) }
function WriteText([string]$p, [string]$t) { [IO.File]::WriteAllText((Join-Path $Root $p), $t, $Utf8) }

function Get-Version {
  $m = [regex]::Match((ReadText 'js/version.js'), "APP_VERSION = '([^']+)'")
  if (-not $m.Success) { throw 'No encuentro APP_VERSION en js/version.js' }
  $m.Groups[1].Value
}
function Set-Version([string]$v) {
  WriteText 'js/version.js' ([regex]::Replace((ReadText 'js/version.js'), "APP_VERSION = '[^']+'", "APP_VERSION = '$v'"))
  WriteText 'sw.js' ([regex]::Replace((ReadText 'sw.js'), "const VERSION = '[^']+'", "const VERSION = '$v'"))
  WriteText 'package.json' ([regex]::Replace((ReadText 'package.json'), '"version": "[^"]+"', "`"version`": `"$v`""))
}
function Test-Versions {
  $v = Get-Version
  if ((ReadText 'sw.js') -notmatch [regex]::Escape("const VERSION = '$v'")) { throw "sw.js no tiene la versión $v" }
  if ((ReadText 'package.json') -notmatch [regex]::Escape("`"version`": `"$v`"")) { throw "package.json no tiene la versión $v" }
}
function Step-Version([string]$v, [string]$kind) {
  $p = ($v -replace '-beta\.\d+$', '').Split('.') | ForEach-Object { [int]$_ }
  switch ($kind) {
    'major' { "$($p[0] + 1).0.0" }
    'minor' { "$($p[0]).$($p[1] + 1).0" }
    default { "$($p[0]).$($p[1]).$($p[2] + 1)" }
  }
}

# Notas pendientes (NEXT.md sin la cabecera y sin comentarios)
function Get-NextNotes {
  $t = ReadText 'NEXT.md'
  $t = [regex]::Replace($t, '(?s)<!--.*?-->', '')
  ($t -split "`n" | Where-Object { $_ -notmatch '^#' }) -join "`n" | ForEach-Object { $_.Trim() }
}
function Clear-NextNotes {
  $t = ReadText 'NEXT.md'
  $head = [regex]::Match($t, '(?s)^.*?-->\s*').Value
  if (-not $head) { $head = "# Próxima versión`n`n" }
  WriteText 'NEXT.md' ($head.TrimEnd() + "`n")
}
function Add-ChangelogEntry([string]$v, [string]$body) {
  $t = ReadText 'CHANGELOG.md'
  $date = Get-Date -Format 'yyyy-MM-dd'
  $entry = "## $v — $date`n$($body.Trim())`n`n"
  $i = $t.IndexOf("`n## ")
  if ($i -lt 0) { throw 'CHANGELOG.md no tiene entradas' }
  WriteText 'CHANGELOG.md' ($t.Substring(0, $i + 1) + $entry + $t.Substring($i + 1))
}

# Mezcla una rama en la actual; si solo chocan los números de versión, se queda con los de la actual.
function Merge-Keep([string]$ref) {
  & git -c "user.name=$GitName" -c "user.email=$GitEmail" merge --no-edit -q $ref
  if ($LASTEXITCODE) {
    $conf = @(git diff --name-only --diff-filter=U)
    $other = @($conf | Where-Object { $VersionFiles -notcontains $_ })
    if ($other.Count) { G merge --abort; throw "Conflicto al mezclar $ref en: $($other -join ', '). Resuélvelo a mano." }
    foreach ($f in $conf) { G checkout --ours -- $f; G add -- $f }
    G -c "user.name=$GitName" -c "user.email=$GitEmail" commit -q --no-edit
  }
}

function Assert-Clean {
  $dirty = @(git status --porcelain)
  if ($dirty.Count) { throw "Hay cambios sin guardar en commits:`n$($dirty -join "`n")" }
}

function Invoke-Checks {
  if ($SkipChecks) { Write-Host 'Comprobaciones saltadas (-SkipChecks)'; return }
  Write-Host '== Comprobaciones'
  Test-Versions
  Run node tests/teams-check.mjs | Out-Null
  Run node tests/effects-check.mjs | Out-Null
  Run node tests/advice-check.mjs | Out-Null
  $probe = Join-Path $env:TEMP 'dokkan-probe'
  if (Test-Path $probe) {
    Run node tests/scrapers-check.mjs $probe | Out-Null
    Run node tests/fyi-check.mjs $probe | Out-Null
  }
  Write-Host '   ok'
}

function Wait-Live([string]$url, [string]$v) {
  if ($NoWait) { return }
  Write-Host "== Esperando a que $url muestre $v (suele tardar 1-3 min)"
  for ($i = 1; $i -le 40; $i++) {
    Start-Sleep 15
    try {
      $c = (Invoke-WebRequest "$($url)js/version.js?t=$(Get-Random)" -UseBasicParsing).Content
      if ($c -match [regex]::Escape("'$v'")) { Write-Host "   publicada en $($i * 15) s"; return }
    } catch { }
  }
  Write-Warning "La web todavía no muestra $v. Mira la pestaña Actions de GitHub."
}

function New-GhRelease([string]$tag, [string]$body, [switch]$Pre) {
  $f = New-TemporaryFile
  [IO.File]::WriteAllText($f.FullName, $body, $Utf8)
  $title = if ($Pre) { "$tag (beta)" } else { $tag }
  if ($Pre) { Run gh release create $tag --title $title --notes-file $f.FullName --prerelease }
  else { Run gh release create $tag --title $title --notes-file $f.FullName --latest }
  Remove-Item $f
}

function Publish([string]$branch, [string]$v, [string]$body, [switch]$Pre) {
  $tag = "v$v"
  Set-Version $v
  G add -A
  Commit $tag
  G tag -a $tag -m $tag
  G push -q origin $branch
  G push -q origin $tag
  New-GhRelease $tag $body -Pre:$Pre
  Write-Host "== $tag subida a $branch"
}

# ------------------------------------------------------------------

if ($Action -eq 'rollback') {
  if (-not $To) { throw 'Indica la versión: -To v2.6.0' }
  G fetch -q --tags
  & git rev-parse -q --verify "refs/tags/$To" | Out-Null
  if ($LASTEXITCODE) { throw "No existe la etiqueta $To" }
  Run gh workflow run deploy.yml -f "stable_ref=$To"
  Write-Host "Publicando $To en la web estable. Se mantendrá hasta la próxima subida a main o actualización de datos."
  Wait-Live $Site ($To -replace '^v', '')
  return
}

Assert-Clean
G fetch -q origin
$start = (git branch --show-current)

if ($Action -eq 'beta') {
  G checkout -q beta
  G pull -q --rebase origin beta
  Merge-Keep 'origin/main'       # la beta siempre lleva las correcciones de la estable
  $notes = Get-NextNotes
  if (-not $notes) { throw 'NEXT.md está vacío: escribe ahí las novedades de esta beta.' }
  $cur = Get-Version
  if ($cur -match '^(\d+\.\d+\.\d+)-beta\.(\d+)$' -and -not $Bump) { $v = "$($Matches[1])-beta.$([int]$Matches[2] + 1)" }
  else { $kind = if ($Bump) { $Bump } else { 'minor' }; $v = "$(Step-Version $cur $kind)-beta.1" }
  Invoke-Checks
  Publish 'beta' $v $notes -Pre
  Wait-Live "$($Site)beta/" $v
}
elseif ($Action -eq 'stable' -and $FromBeta) {
  # 1) la beta recoge lo último de main, 2) main avanza hasta la beta, 3) versión estable
  G checkout -q beta
  G pull -q --rebase origin beta
  Merge-Keep 'origin/main'
  G push -q origin beta
  $notes = Get-NextNotes
  if (-not $notes) { throw 'NEXT.md está vacío: no hay novedades que publicar.' }
  $cur = Get-Version
  $v = if ($cur -match '^(\d+\.\d+\.\d+)-beta\.\d+$') { $Matches[1] } else { Step-Version $cur 'minor' }
  G checkout -q main
  G pull -q --rebase origin main
  G merge -q --ff-only beta
  Add-ChangelogEntry $v $notes
  Clear-NextNotes
  Invoke-Checks
  Publish 'main' $v $notes
  G checkout -q beta
  G merge -q --ff-only main
  G push -q origin beta
  Wait-Live $Site $v
}
elseif ($Action -eq 'stable') {
  if (-not $Notes) { throw 'Indica qué cambia: -Notes "Corregido: ..."' }
  G checkout -q main
  G pull -q --rebase origin main
  $kind = if ($Bump) { $Bump } else { 'patch' }
  $v = Step-Version (Get-Version) $kind
  $body = ($Notes | ForEach-Object { "- $_" }) -join "`n"
  Add-ChangelogEntry $v $body
  Invoke-Checks
  Publish 'main' $v $body
  # Si la beta no tiene nada pendiente, avanza con la estable para que las dos webs coincidan.
  & git merge-base --is-ancestor origin/beta main
  if (-not $LASTEXITCODE) { G push -q origin main:beta; Write-Host '   beta puesta al día' }
  Wait-Live $Site $v
}

if ($start -and $start -ne (git branch --show-current)) { G checkout -q $start }
