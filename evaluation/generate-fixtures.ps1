$ErrorActionPreference = 'Stop'

$edgeCandidates = @(
  'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
)
$edge = $edgeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $edge) {
  throw 'Microsoft Edge was not found. Install Edge or update the path list in this script to render the local mock screens.'
}

$sourcePath = Join-Path $PSScriptRoot 'fixture-ui.html'
if (-not (Test-Path -LiteralPath $sourcePath)) {
  throw "Fixture source page not found: $sourcePath"
}

$outputDirectory = Join-Path $PSScriptRoot 'screens'
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$sourceUrl = [uri]::new((Resolve-Path -LiteralPath $sourcePath).Path).AbsoluteUri
$caseIds = @(
  'ordinary-retail-dashboard',
  'mailbox-lookalike-request',
  'browser-certificate-warning',
  'windows-security-up-to-date',
  'cropped-account-message',
  'payment-change-request',
  'unexpected-signin-prompt',
  'fake-software-update',
  'macro-attachment-warning',
  'cloud-share-permission',
  'legitimate-payroll-notice'
)

foreach ($caseId in $caseIds) {
  $outputPath = Join-Path $outputDirectory "$caseId.png"
  $arguments = @(
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--window-size=1440,900',
    "--screenshot=$outputPath",
    "$sourceUrl`?case=$caseId"
  )
  $process = Start-Process -FilePath $edge -ArgumentList $arguments -Wait -PassThru -WindowStyle Hidden
  if ($process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $outputPath)) {
    throw "Could not render fixture '$caseId' (Edge exit code: $($process.ExitCode))."
  }
  $image = Get-Item -LiteralPath $outputPath
  if ($image.Length -lt 5000) {
    throw "Rendered fixture '$caseId' looks incomplete ($($image.Length) bytes)."
  }
  Write-Output "Created $($image.FullName)"
}

Write-Output 'Realistic local mock screens are ready. They contain no active links, real account data, or live malware.'
