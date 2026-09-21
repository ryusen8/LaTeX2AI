# SPDX-License-Identifier: MIT
param([Parameter(Mandatory=$true)][string]$FormsExe)
$ErrorActionPreference = 'Stop'
[void][Reflection.Assembly]::LoadFrom($FormsExe)
$fixtures = @(
    'The energy $E=mc^2$ increases by 5% & sample_1 remains editable. $$a^2+b^2=c^2.$$ Then $x_i$ continues.',
    'Use \$5 and “quotes”—with $\frac{1}{2}$, \(\alpha+\beta\), and \[\sum_{i=1}^n x_i=0\].',
    'An aligned result: $$\begin{aligned}a&=b+c\\d&=e+f\end{aligned}$$ is useful.',
    'A paragraph without formulas retains spaces & literal underscores_like_this.'
)
foreach ($source in $fixtures) {
    $folder = [L2A.UTIL.EditableParagraph]::Prepare($source, 110, 12)
    if (-not (Test-Path (Join-Path $folder 'insert.jsx'))) { throw 'Insertion script missing.' }
    Write-Output "PASS editable fixture: $folder"
}
try {
    [L2A.UTIL.EditableParagraph]::Prepare('Bad math $\notarealcommandxyz$', 90, 11) | Out-Null
    throw 'Invalid math was accepted.'
} catch {
    if ($_.Exception.ToString() -notmatch 'compilation failed') { throw }
    Write-Output 'PASS invalid LaTeX is reported before insertion'
}
