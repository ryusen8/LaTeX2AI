# SPDX-License-Identifier: MIT
param([Parameter(Mandatory=$true)][string]$FormsExe)
$ErrorActionPreference = 'Stop'
[void][Reflection.Assembly]::LoadFrom($FormsExe)
$formula = '{\fontsize{11}{14}\selectfont $\begin{aligned}a&<b\\c&=d\end{aligned}$}'
[xml]$note = [L2A.UTIL.EditableParagraph]::CreateFormulaNote($formula, [Text.Encoding]::ASCII.GetBytes("PDF fixture"))
if ($note.LaTeX2AI_item.latex.InnerText -cne $formula -or $note.LaTeX2AI_item.placed_option -ne 'keep_scale' -or $note.LaTeX2AI_item.text_align_horizontal -ne 'left' -or $note.LaTeX2AI_item.text_align_vertical -ne 'top') {
    throw 'Formula metadata does not preserve source and native placement.'
}
if ([Text.Encoding]::ASCII.GetString([Convert]::FromBase64String($note.LaTeX2AI_item.pdf_file_contents.InnerText)) -ne 'PDF fixture') { throw 'PDF payload was not preserved.' }
if ([L2A.UTIL.EditableParagraph]::NativeHash('') -ne 'cbf29ce484222325' -or [L2A.UTIL.EditableParagraph]::NativeHash('a') -ne 'af63dc4c8601ec8c') { throw 'Native Windows hash compatibility failed.' }
Write-Output 'PASS native formula metadata preserves source, PDF and hash'
$fixtures = @(
    'The energy $E=mc^2$ increases by 5% & sample_1 remains editable. $$a^2+b^2=c^2.$$ Then $x_i$ continues.',
    'Use \$5 and “quotes”—with $\frac{1}{2}$, \(\alpha+\beta\), and \[\sum_{i=1}^n x_i=0\].',
    'An aligned result: $$\begin{aligned}a&=b+c\\d&=e+f\end{aligned}$$ is useful.',
    'A paragraph without formulas retains spaces & literal underscores_like_this.',
    'The region $\mathcal{R}\subset\mathbb{R}^2$ contains $p\_i$, with $\\|v\_i\\|\le v\_{\max}$ and a literal \$5.'
)
foreach ($source in $fixtures) {
    $folder = [L2A.UTIL.EditableParagraph]::Prepare($source, 110, 12)
    if (-not (Test-Path (Join-Path $folder 'insert.jsx'))) { throw 'Insertion script missing.' }
    if (-not (Test-Path (Join-Path $folder 'paragraph.pdf'))) { throw 'Precompiled native preview missing.' }
    Write-Output "PASS editable fixture: $folder"
}
try {
    [L2A.UTIL.EditableParagraph]::Prepare('Bad math $\notarealcommandxyz$', 90, 11) | Out-Null
    throw 'Invalid math was accepted.'
} catch {
    if ($_.Exception.ToString() -notmatch 'compilation failed') { throw }
    Write-Output 'PASS invalid LaTeX is reported before insertion'
}
