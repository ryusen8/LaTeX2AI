# SPDX-License-Identifier: MIT
param(
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '../../../output/paragraph-tests'),
    [string]$FormsExe
)
$ErrorActionPreference = 'Stop'
$repoDirectory = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
New-Item -ItemType Directory -Force $OutputDirectory | Out-Null
$outputPath = (Resolve-Path $OutputDirectory).Path
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$testExe = Join-Path $outputPath 'ParagraphTests.exe'
& $compiler /nologo /target:exe "/out:$testExe" (Join-Path $repoDirectory 'forms/src/utlility/paragraph.cs') (Join-Path $repoDirectory 'forms/tests/ParagraphTests.cs')
if ($LASTEXITCODE -ne 0) { throw 'Test compilation failed.' }
& $testExe (Join-Path $outputPath 'fixtures')
if ($LASTEXITCODE -ne 0) { throw 'Paragraph tests failed.' }
if ($FormsExe) {
    # Run in Windows PowerShell to use the same .NET Framework as the forms app.
    $exePath = (Resolve-Path $FormsExe).Path
    Copy-Item -LiteralPath $exePath -Destination (Join-Path $outputPath 'LaTeX2AIForms.exe') -Force
    $responsiveExe = Join-Path $outputPath 'ResponsiveTests.exe'
    & $compiler /nologo /target:exe "/out:$responsiveExe" "/reference:$exePath" /reference:System.Windows.Forms.dll (Join-Path $repoDirectory 'forms/tests/ResponsiveTests.cs')
    if ($LASTEXITCODE -ne 0) { throw 'Responsive test compilation failed.' }
    & $responsiveExe
    if ($LASTEXITCODE -ne 0) { throw 'Responsive input/cancellation tests failed.' }
    & powershell.exe -NoProfile -File (Join-Path $repoDirectory 'forms/tests/CompileEditableFixtures.ps1') -FormsExe $exePath
    if ($LASTEXITCODE -ne 0) { throw 'Editable formula compilation failed.' }
}
