param([string]$EvaluationFile='evaluation.json',[string]$OutputFile='avant_apres.png')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$resultDir=Join-Path $PSScriptRoot 'resultats'
$example=Get-Content -LiteralPath (Join-Path $resultDir 'exemple.json') -Raw | ConvertFrom-Json
$report=Get-Content -LiteralPath (Join-Path $resultDir $EvaluationFile) -Raw | ConvertFrom-Json
$trial=$report.real | Where-Object label -eq $example.source | Select-Object -First 1
if(-not $trial){throw 'Exemple réel absent du bilan.'}
$grid=$example.grid
$bmp=[System.Drawing.Bitmap]::new(1600,1020)
$g=[System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::White)
$title=[System.Drawing.Font]::new('Segoe UI',23,[System.Drawing.FontStyle]::Bold)
$font=[System.Drawing.Font]::new('Segoe UI',14)
$small=[System.Drawing.Font]::new('Segoe UI',11)
$ink=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(23,51,77))
$unknown=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(225,230,235))
$occupied=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(40,56,70))
$headingTitle=switch($trial.result.method){
 'gradient'{'TP 2 - Descente de gradient : avant / apres'}
 'pyramid'{'TP 2 - Multi-resolution : avant / apres'}
 'annealing'{'TP 2 - Recuit simule : avant / apres'}
 'exhaustive-correlative-chamfer'{'TP 2 - Recherche exhaustive : avant / apres'}
 default{'TP 2 - Localisation sur grille : avant / apres'}
}
$g.DrawString($headingTitle,$title,$ink,45,20)
$g.DrawString('Grille de quatre scans ; scan test exclu de la construction. Reperes et poses estimes au TP 1.',$font,$ink,45,65)
foreach($panel in 0,1){
 $left=55+780*$panel;$top=170
 $width=[double]$grid.nx*[double]$grid.resolution;$height=[double]$grid.ny*[double]$grid.resolution
 $scale=[Math]::Min(650/$width,625/$height)
 $pose=if($panel -eq 0){$trial.result.initial}else{$trial.result.pose}
 $heading=if($panel -eq 0){'AVANT - Pose initiale perturbee'}else{'APRES - Pose estimee sur la grille'}
 $g.DrawString($heading,$font,$ink,$left,120)
 for($y=0;$y -lt $grid.ny;$y++){
  for($x=0;$x -lt $grid.nx;$x++){
   $value=$grid.cells[$y*$grid.nx+$x]
   if($value -eq 0){continue}
   $brush=if($value -eq 255){$occupied}else{$unknown}
   $g.FillRectangle($brush,[single]($left+$x*$grid.resolution*$scale),[single]($top+($grid.ny-1-$y)*$grid.resolution*$scale),[single]($grid.resolution*$scale+.3),[single]($grid.resolution*$scale+.3))
  }
 }
 $axis=[System.Drawing.Pen]::new([System.Drawing.Color]::LightSlateGray,1)
 $g.DrawRectangle($axis,[single]$left,[single]$top,[single]($width*$scale),[single]($height*$scale))
 for($i=0;$i -le $width;$i+=2){$g.DrawString(([double]$grid.x+$i).ToString('0'),$small,$ink,[single]($left+$i*$scale-5),[single]($top+$height*$scale+5))}
 for($j=0;$j -le $height;$j+=2){$g.DrawString(([double]$grid.y+$j).ToString('0'),$small,$ink,[single]($left-35),[single]($top+($height-$j)*$scale-7))}
 $color=if($panel -eq 0){[System.Drawing.Color]::FromArgb(210,103,25)}else{[System.Drawing.Color]::FromArgb(19,106,195)}
 $points=[System.Drawing.SolidBrush]::new($color);$pen=[System.Drawing.Pen]::new($color,3)
 $a=[double]$pose.theta*[Math]::PI/180;$c=[Math]::Cos($a);$s=[Math]::Sin($a)
 foreach($p in $example.scan.points){
  $px=[double]$pose.x+$c*$p[0]-$s*$p[1];$py=[double]$pose.y+$s*$p[0]+$c*$p[1]
  $sx=$left+($px-$grid.x)*$scale;$sy=$top+($grid.y+$height-$py)*$scale
  if($sx -ge $left -and $sx -le $left+$width*$scale -and $sy -ge $top -and $sy -le $top+$height*$scale){$g.FillEllipse($points,[single]($sx-2.4),[single]($sy-2.4),[single]4.8,[single]4.8)}
 }
 $ox=$left+($pose.x-$grid.x)*$scale;$oy=$top+($grid.y+$height-$pose.y)*$scale
 $g.DrawEllipse($pen,[single]($ox-6),[single]($oy-6),[single]12,[single]12)
 $g.DrawLine($pen,[single]$ox,[single]$oy,[single]($ox+30*$c),[single]($oy-30*$s))
 $metrics=if($panel -eq 0){$trial.result.before}else{$trial.result.after}
 $g.DrawString(('x={0:F3} m ; y={1:F3} m ; angle={2:F2} deg' -f $pose.x,$pose.y,$pose.theta),$font,$ink,$left,835)
 $g.DrawString(('Score={0:F3} ; couverture connue={1:F1} %' -f $metrics.score,($metrics.coverage*100)),$font,$ink,$left,865)
 $axis.Dispose();$points.Dispose();$pen.Dispose()
}
$g.DrawString('Cellules : blanc = libre ; gris = inconnu ; sombre = occupe. Axes X/Y en metres. Points colores = scan test.',$small,$ink,45,925)
$g.DrawString('Trace des donnees calculees, pas une capture du navigateur. Pseudo-reference TP 1 : aucune precision physique certifiee.',$small,$ink,45,955)
$bmp.Save((Join-Path $resultDir $OutputFile),[System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose();$bmp.Dispose();$title.Dispose();$font.Dispose();$small.Dispose();$ink.Dispose();$unknown.Dispose();$occupied.Dispose()
