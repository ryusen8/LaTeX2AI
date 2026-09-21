# SPDX-License-Identifier: MIT
# Run with Windows PowerShell, Illustrator open, and the compatibility forms built.
# Creates only scratch documents and closes them without touching user documents.
param([Parameter(Mandatory=$true)][string]$FormsExe,[Parameter(Mandatory=$true)][string]$OutputDirectory,[Parameter(Mandatory=$true)][string]$NativeTemplate)
$ErrorActionPreference='Stop'
[void][Reflection.Assembly]::LoadFrom((Resolve-Path $FormsExe))
$shared=[IO.Directory]::CreateDirectory($OutputDirectory).FullName.Replace('\','/')
$source='The region $\mathbb{R}^2$ contains $x_i$. Resize this paragraph to move each formula with the editable text. $$\frac{1}{n}\sum_{i=1}^{n}x_i$$ More editable prose with $H$ to compare capital heights.'
$folder=[L2A.UTIL.EditableParagraph]::PrepareFlow($source,280,18,$false,'left',[Threading.CancellationToken]::None,$null)
Get-ChildItem -LiteralPath $folder -File | Copy-Item -Destination $shared -Force
$script=[IO.File]::ReadAllText((Join-Path $folder 'insert.jsx')).Replace($folder.Replace('\','/'),$shared)
$line=$script.Substring(0,$script.IndexOf("`n"))
$checks=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'FlowHostAssertions.jsx'))
$app=[Runtime.InteropServices.Marshal]::GetActiveObject('Illustrator.Application')
foreach($color in @('RGB','CMYK')) {
    $setup=$line+'var template=app.open(new File('+[L2A.UTIL.EditableParagraph]::Quote((Resolve-Path $NativeTemplate).Path.Replace('\','/'))+'));'+@'
var d=app.documents.add(DocumentColorSpace.COLOR,600,700);
var p=template.placedItems[0].duplicate(d.layers[0],ElementPlacement.PLACEATEND),src=new File(job.segments[1].file);
template.close(SaveOptions.DONOTSAVECHANGES);d.activate();
var target=new File(src.parent.fsName+'/flow_LaTeX2AI_preview.pdf');
src.copy(target.fsName);p.relink(target);p.note='%L2A-EDITABLE-JOB:'+job.id;p.position=[50,650];
'@.Replace('COLOR',$color)
    $app.DoJavaScript($setup)|Out-Null
    try {
        $result=$app.DoJavaScript($script.Replace('if (job.done &&','job.done=""; if (job.done &&'))
        if($result -notlike 'OK:*'){throw $result}
        Write-Output "$color $result"
        Write-Output $app.DoJavaScript($checks)
    } finally { $app.DoJavaScript('app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);')|Out-Null }
}
