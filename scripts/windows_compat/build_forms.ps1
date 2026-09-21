# SPDX-License-Identifier: MIT
param(
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '../../../output/paragraph-forms'),
    [string]$PythonExe = 'python'
)
$ErrorActionPreference = 'Stop'
$repoDirectory = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$buildTool = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/MSBuild.exe'
if (-not (Test-Path -LiteralPath $buildTool)) { throw '.NET Framework MSBuild is required.' }
New-Item -ItemType Directory -Force $OutputDirectory | Out-Null
$outputPath = (Resolve-Path -LiteralPath $OutputDirectory).Path + '\'
$oldPython = $env:PYTHON_EXE
$oldSha = $env:L2A_FORMS_PLUGIN_SHA
try {
    $env:PYTHON_EXE = $PythonExe
    # Protocol compatibility with the installed v0.0.10 native plugin. Do not
    # disable the handshake or pretend this forms binary has the current SHA.
    $env:L2A_FORMS_PLUGIN_SHA = 'b5c0db97017536b86b162bce2067a6fd8ba203df'
    & $buildTool (Join-Path $repoDirectory 'forms/LaTeX2AIForms.csproj') /t:Rebuild /p:Configuration=Release /p:PlatformTarget=x64 "/p:OutputPath=$outputPath" /v:minimal /nologo
    if ($LASTEXITCODE -ne 0) { throw 'Forms build failed.' }
} finally {
    $env:PYTHON_EXE = $oldPython
    $env:L2A_FORMS_PLUGIN_SHA = $oldSha
}
Write-Output (Join-Path $outputPath 'LaTeX2AIForms.exe')
