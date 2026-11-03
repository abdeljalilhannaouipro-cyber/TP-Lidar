$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$folder=Join-Path $PSScriptRoot 'resultats'
$data=Get-Content -LiteralPath (Join-Path $folder 'niveaux_multiresolution.json') -Raw | ConvertFrom-Json
$all=[System.Collections.Generic.List[object]]::new()
foreach($f in $data.map.features){$all.Add($f.segment.a);$all.Add($f.segment.b)}
foreach($level in $data.levels){$pose=$level.pose;$a=$pose.theta*[Math]::PI/180;$c=[Math]::Cos($a);$s=[Math]::Sin($a);foreach($p in $level.cloud){$all.Add(@(($pose.x+$c*$p[0]-$s*$p[1]),($pose.y+$s*$p[0]+$c*$p[1])))}}
$xmin=[double]::PositiveInfinity;$ymin=$xmin;$xmax=[double]::NegativeInfinity;$ymax=$xmax
foreach($p in $all){$xmin=[Math]::Min($xmin,$p[0]);$xmax=[Math]::Max($xmax,$p[0]);$ymin=[Math]::Min($ymin,$p[1]);$ymax=[Math]::Max($ymax,$p[1])}
$xmin=[Math]::Floor($xmin)-1;$ymin=[Math]::Floor($ymin)-1;$xmax=[Math]::Ceiling($xmax)+1;$ymax=[Math]::Ceiling($ymax)+1;$scale=[Math]::Min(440/($xmax-$xmin),470/($ymax-$ymin))
$bmp=[System.Drawing.Bitmap]::new(1650,790);$g=[System.Drawing.Graphics]::FromImage($bmp);$g.Clear([System.Drawing.Color]::White);$g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$title=[System.Drawing.Font]::new('Segoe UI',23,[System.Drawing.FontStyle]::Bold);$font=[System.Drawing.Font]::new('Segoe UI',13);$small=[System.Drawing.Font]::new('Segoe UI',11)
$ink=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(23,51,77));$wall=[System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(85,98,110),2);$grid=[System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(230,236,241),1)
$g.DrawString('Multi-resolution vectorielle : affiner le scan et la pose',$title,$ink,35,20)
$g.DrawString('Meme carte de segments a chaque niveau. Les points du scan sont regroupes puis utilises integralement.',$font,$ink,35,65)
$colors=@([System.Drawing.Color]::DarkOrange,[System.Drawing.Color]::SeaGreen,[System.Drawing.Color]::RoyalBlue)
for($i=0;$i -lt 3;$i++){
 $level=$data.levels[$i];$left=50+545*$i;$top=180;$pose=$level.pose
 $label=if($level.voxelSizeM -gt 0){('Voxels de {0:F0} cm' -f ($level.voxelSizeM*100))}else{'Scan complet'}
 $g.DrawString(('Niveau '+($i+1)+' - '+$label),$font,$ink,$left,115)
 $g.DrawString(($level.points.ToString()+' points ; pas pose '+($level.translationStepM*100).ToString('0.0')+' cm / '+$level.angleStepDeg+' deg'),$small,$ink,$left,145)
 for($x=$xmin;$x -le $xmax;$x+=2){$sx=$left+($x-$xmin)*$scale;$g.DrawLine($grid,[single]$sx,[single]$top,[single]$sx,[single]($top+($ymax-$ymin)*$scale));$g.DrawString($x.ToString(),$small,$ink,[single]($sx-4),[single]($top+($ymax-$ymin)*$scale+5))}
 for($y=$ymin;$y -le $ymax;$y+=2){$sy=$top+($ymax-$y)*$scale;$g.DrawLine($grid,[single]$left,[single]$sy,[single]($left+($xmax-$xmin)*$scale),[single]$sy);$g.DrawString($y.ToString(),$small,$ink,[single]($left-28),[single]($sy-7))}
 foreach($f in $data.map.features){$a=$f.segment.a;$b=$f.segment.b;$g.DrawLine($wall,[single]($left+($a[0]-$xmin)*$scale),[single]($top+($ymax-$a[1])*$scale),[single]($left+($b[0]-$xmin)*$scale),[single]($top+($ymax-$b[1])*$scale))}
 $brush=[System.Drawing.SolidBrush]::new($colors[$i]);$a=$pose.theta*[Math]::PI/180;$c=[Math]::Cos($a);$s=[Math]::Sin($a)
 foreach($p in $level.cloud){$px=$pose.x+$c*$p[0]-$s*$p[1];$py=$pose.y+$s*$p[0]+$c*$p[1];$g.FillEllipse($brush,[single]($left+($px-$xmin)*$scale-2.4),[single]($top+($ymax-$py)*$scale-2.4),[single]4.8,[single]4.8)}
 $g.DrawString(('x={0:F3} m ; y={1:F3} m ; angle={2:F2} deg' -f $pose.x,$pose.y,$pose.theta),$small,$ink,$left,690)
 $brush.Dispose()
}
$g.DrawString('X/Y en metres ; pose estimee au niveau considere. Les couts entre niveaux utilisent des scans differents et ne sont pas directement comparables.',$small,$ink,35,745)
$bmp.Save((Join-Path $folder 'niveaux_multiresolution.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose();$bmp.Dispose();$title.Dispose();$font.Dispose();$small.Dispose();$ink.Dispose();$wall.Dispose();$grid.Dispose()
