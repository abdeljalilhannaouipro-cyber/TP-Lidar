param([string]$EvaluationFile='evaluation.json',[string]$OutputFile='avant_apres.png')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$folder=Join-Path $PSScriptRoot 'resultats'
$example=Get-Content -LiteralPath (Join-Path $folder 'exemple.json') -Raw | ConvertFrom-Json
$report=Get-Content -LiteralPath (Join-Path $folder $EvaluationFile) -Raw | ConvertFrom-Json
$trial=$report.real | Where-Object label -eq $example.source | Select-Object -First 1
$points=[System.Collections.Generic.List[object]]::new()
foreach($f in $example.map.features){$points.Add($f.segment.a);$points.Add($f.segment.b)}
foreach($pose in @($trial.result.initial,$trial.result.pose)){
 $a=$pose.theta*[Math]::PI/180;$c=[Math]::Cos($a);$s=[Math]::Sin($a)
 foreach($p in $example.scan.points){$points.Add(@(($pose.x+$c*$p[0]-$s*$p[1]),($pose.y+$s*$p[0]+$c*$p[1])))}
}
$xmin=[double]::PositiveInfinity;$ymin=$xmin;$xmax=[double]::NegativeInfinity;$ymax=$xmax
foreach($p in $points){$xmin=[Math]::Min($xmin,$p[0]);$xmax=[Math]::Max($xmax,$p[0]);$ymin=[Math]::Min($ymin,$p[1]);$ymax=[Math]::Max($ymax,$p[1])}
$xmin=[Math]::Floor($xmin)-1;$ymin=[Math]::Floor($ymin)-1;$xmax=[Math]::Ceiling($xmax)+1;$ymax=[Math]::Ceiling($ymax)+1
$scale=[Math]::Min(650/($xmax-$xmin),625/($ymax-$ymin))
$bmp=[System.Drawing.Bitmap]::new(1600,1030);$g=[System.Drawing.Graphics]::FromImage($bmp);$g.Clear([System.Drawing.Color]::White);$g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$title=[System.Drawing.Font]::new('Segoe UI',23,[System.Drawing.FontStyle]::Bold);$font=[System.Drawing.Font]::new('Segoe UI',14);$small=[System.Drawing.Font]::new('Segoe UI',11)
$ink=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(23,51,77));$wall=[System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(45,60,75),3);$grid=[System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(232,237,242),1)
$headingTitle=switch($trial.result.method){'gradient-point-to-finite-segments'{'TP 2 - Carte vectorielle : descente de gradient'}'multiresolution-point-to-finite-segments'{'TP 2 - Carte vectorielle : multi-resolution'}'annealing-point-to-finite-segments'{'TP 2 - Carte vectorielle : recuit simule'}'direct-segment-orientation-and-translation'{'TP 2 - Carte vectorielle : calcul direct'}default{'TP 2 - Carte vectorielle : recherche exhaustive'}}
$g.DrawString($headingTitle,$title,$ink,45,20)
$g.DrawString('Reference : segments de 4 scans ; scan test exclu. Les deux panneaux utilisent le meme repere et la meme echelle.',$font,$ink,45,65)
foreach($panel in 0,1){
 $left=55+780*$panel;$top=170;$pose=if($panel -eq 0){$trial.result.initial}else{$trial.result.pose}
 $heading=if($panel -eq 0){'AVANT - Pose initiale perturbee'}else{'APRES - Pose estimee sur les segments'}
 $g.DrawString($heading,$font,$ink,$left,120)
 for($x=$xmin;$x -le $xmax;$x+=2){$sx=$left+($x-$xmin)*$scale;$g.DrawLine($grid,[single]$sx,[single]$top,[single]$sx,[single]($top+($ymax-$ymin)*$scale));$g.DrawString($x.ToString('0'),$small,$ink,[single]($sx-5),[single]($top+($ymax-$ymin)*$scale+5))}
 for($y=$ymin;$y -le $ymax;$y+=2){$sy=$top+($ymax-$y)*$scale;$g.DrawLine($grid,[single]$left,[single]$sy,[single]($left+($xmax-$xmin)*$scale),[single]$sy);$g.DrawString($y.ToString('0'),$small,$ink,[single]($left-35),[single]($sy-7))}
 foreach($f in $example.map.features){$a=$f.segment.a;$b=$f.segment.b;$g.DrawLine($wall,[single]($left+($a[0]-$xmin)*$scale),[single]($top+($ymax-$a[1])*$scale),[single]($left+($b[0]-$xmin)*$scale),[single]($top+($ymax-$b[1])*$scale))}
 $color=if($panel -eq 0){[System.Drawing.Color]::FromArgb(210,103,25)}else{[System.Drawing.Color]::FromArgb(19,106,195)}
 $brush=[System.Drawing.SolidBrush]::new($color);$pen=[System.Drawing.Pen]::new($color,3)
 $a=$pose.theta*[Math]::PI/180;$c=[Math]::Cos($a);$s=[Math]::Sin($a)
 foreach($p in $example.scan.points){$px=$pose.x+$c*$p[0]-$s*$p[1];$py=$pose.y+$s*$p[0]+$c*$p[1];$g.FillEllipse($brush,[single]($left+($px-$xmin)*$scale-2.3),[single]($top+($ymax-$py)*$scale-2.3),[single]4.6,[single]4.6)}
 $ox=$left+($pose.x-$xmin)*$scale;$oy=$top+($ymax-$pose.y)*$scale;$g.DrawEllipse($pen,[single]($ox-6),[single]($oy-6),[single]12,[single]12);$g.DrawLine($pen,[single]$ox,[single]$oy,[single]($ox+30*$c),[single]($oy-30*$s))
 $m=if($panel -eq 0){$trial.result.before}else{$trial.result.after}
 $g.DrawString(('x={0:F3} m ; y={1:F3} m ; angle={2:F2} deg' -f $pose.x,$pose.y,$pose.theta),$font,$ink,$left,835)
 $g.DrawString(('Cout={0:F4} m2 ; impacts proches des segments={1:F1} %' -f $m.cost,($m.nearFraction*100)),$font,$ink,$left,865)
 $brush.Dispose();$pen.Dispose()
}
$details=if($trial.result.complete){$trial.result.tested.ToString()+' poses testees.'}elseif($trial.result.levels){'3 niveaux ; '+$trial.result.tested+' poses evaluees.'}elseif($trial.result.attemptedMoves){$trial.result.attemptedMoves.ToString()+' tentatives ; graine '+$trial.result.seed+'.'}elseif($trial.result.retainedPairs){'Une resolution directe ; '+$trial.result.retainedPairs.Count+' correspondances.'}else{$trial.result.iterations.ToString()+' iterations ; '+$trial.result.tested+' evaluations du cout.'}
$g.DrawString(('Traits sombres = segments ; points colores = scan test ; X/Y en metres. '+$details),$small,$ink,45,925)
$g.DrawString('Trace calcule, pas une capture du navigateur. Poses TP 1 utilisees comme pseudo-reference, sans precision physique certifiee.',$small,$ink,45,955)
$bmp.Save((Join-Path $folder $OutputFile),[System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose();$bmp.Dispose();$title.Dispose();$font.Dispose();$small.Dispose();$ink.Dispose();$wall.Dispose();$grid.Dispose()
