param([string]$Folder=(Join-Path $PSScriptRoot 'resultats/fusion_finale'))
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$data=Get-Content -LiteralPath (Join-Path $Folder 'nuage_fusionne.json') -Raw -Encoding utf8 | ConvertFrom-Json
$s=$data.summary;$points=$data.points
$xmin=[double]::PositiveInfinity;$xmax=[double]::NegativeInfinity;$ymin=[double]::PositiveInfinity;$ymax=[double]::NegativeInfinity
foreach($p in $points){$xmin=[Math]::Min($xmin,[double]$p[0]);$xmax=[Math]::Max($xmax,[double]$p[0]);$ymin=[Math]::Min($ymin,[double]$p[1]);$ymax=[Math]::Max($ymax,[double]$p[1])}
$xmin-=.6;$xmax+=.6;$ymin-=.6;$ymax+=.6
$scale=[Math]::Min(1080/($xmax-$xmin),760/($ymax-$ymin));$cx=($xmin+$xmax)/2;$cy=($ymin+$ymax)/2
function SX([double]$x){return [single](650+($x-$cx)*$scale)}
function SY([double]$y){return [single](535-($y-$cy)*$scale)}
$bmp=[System.Drawing.Bitmap]::new(1300,1060);$g=[System.Drawing.Graphics]::FromImage($bmp);$g.Clear([System.Drawing.Color]::FromArgb(250,252,253))
$title=[System.Drawing.Font]::new('Segoe UI',26,[System.Drawing.FontStyle]::Bold);$font=[System.Drawing.Font]::new('Segoe UI',13);$small=[System.Drawing.Font]::new('Segoe UI',11)
$ink=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(24,48,64));$muted=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(91,117,132))
$g.DrawString('Nuage lidar fusionne - acquisitions reelles',$title,$ink,45,25)
$g.DrawString(($s.includedCaptures.ToString()+' captures reunies sur '+$s.inputCaptures+' | '+$s.excludedCaptures+' sans pose retenue | '+$s.mergedPointCount+' points'),$font,$muted,47,78)
$background=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(239,244,247));$g.FillRectangle($background,95,130,1110,790)
$pen=[System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(210,224,232),1)
$step=if(($xmax-$xmin)-gt 22 -or ($ymax-$ymin)-gt 22){2}else{1}
for($x=[Math]::Ceiling($xmin/$step)*$step;$x -le $xmax;$x+=$step){$g.DrawLine($pen,(SX $x),[single]130,(SX $x),[single]920);$g.DrawString($x.ToString('0'),$small,$muted,(SX $x),925)}
for($y=[Math]::Ceiling($ymin/$step)*$step;$y -le $ymax;$y+=$step){$g.DrawLine($pen,[single]95,(SY $y),[single]1205,(SY $y));$g.DrawString($y.ToString('0'),$small,$muted,55,(SY $y))}
$colors=@([System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(97,165,170)),[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(24,124,134)),[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(16,74,89)))
foreach($p in $points){$level=if([int]$p[3]-ge 5){2}elseif([int]$p[3]-ge 2){1}else{0};$g.FillRectangle($colors[$level],[single]((SX ([double]$p[0]))-1),[single]((SY ([double]$p[1]))-1),[single]2.3,[single]2.3)}
$origin=[System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(180,90,35),2);$g.DrawLine($origin,[single]((SX 0)-6),(SY 0),[single]((SX 0)+6),(SY 0));$g.DrawLine($origin,(SX 0),[single]((SY 0)-6),(SX 0),[single]((SY 0)+6))
$g.DrawString('Y (m)',$font,$ink,42,115);$g.DrawString('X (m)',$font,$ink,1215,915)
$g.DrawString('Filtrage : 0,20-12 m, intensite >=100 ; fusion par voxels de 5 cm. Couleur foncee : observations repetees.',$small,$muted,45,970)
$g.DrawString('Poses estimees hors ligne. Captures ambigues exclues. Carte complete de la salle non demontree.',$small,$muted,45,1004)
$bmp.Save((Join-Path $Folder 'scan_final.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose();$bmp.Dispose();$pen.Dispose();$origin.Dispose();$background.Dispose();$ink.Dispose();$muted.Dispose();foreach($brush in $colors){$brush.Dispose()};$title.Dispose();$font.Dispose();$small.Dispose()
Write-Output 'Image du nuage final creee.'
