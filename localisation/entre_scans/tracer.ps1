param([string]$DataFolder='resultats',[switch]$PhysicalCampaign)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$folder=Join-Path $PSScriptRoot $DataFolder
$example=Get-Content -LiteralPath (Join-Path $folder 'exemple.json') -Raw | ConvertFrom-Json
$reportFile=if($PhysicalCampaign){'graphiques.json'}else{'evaluation.json'}
$report=Get-Content -LiteralPath (Join-Path $folder $reportFile) -Raw | ConvertFrom-Json
$referenceLabel=if($PhysicalCampaign){'Reference declaree : +0,50 m / 0 / 0 deg ; graduation 1 cm ; incertitude totale inconnue.'}else{'References TP 1 estimees ; incertitude physique inconnue.'}
$errorLabel=if($PhysicalCampaign){'Ecart a la reference declaree'}else{'Ecart a la pseudo-reference'}
$methods=@('exhaustive','gradient','multiresolution','annealing','direct')
$names=@{exhaustive='Recherche exhaustive';gradient='Descente de gradient';multiresolution='Multi-resolution';annealing='Recuit simule';direct='Calcul direct (une passe)'}
$title=[System.Drawing.Font]::new('Segoe UI',23,[System.Drawing.FontStyle]::Bold);$font=[System.Drawing.Font]::new('Segoe UI',13);$small=[System.Drawing.Font]::new('Segoe UI',11)
$ink=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(23,51,77));$fixed=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(30,105,190));$orange=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(220,110,25));$green=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(0,145,105));$red=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::Firebrick);$grey=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(150,162,174));$grid=[System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(230,237,243),1)
function Transform-ScanPoint($p,$pose){$a=$pose.theta*[Math]::PI/180;$c=[Math]::Cos($a);$s=[Math]::Sin($a);return @(($pose.x+$c*$p[0]-$s*$p[1]),($pose.y+$s*$p[0]+$c*$p[1]))}
$all=[System.Collections.Generic.List[object]]::new();foreach($p in $example.reference.points){$all.Add($p)}
foreach($pose in @($example.initial)+@($example.results | Where-Object result | ForEach-Object { $_.result.pose })){foreach($p in $example.query.points){$all.Add((Transform-ScanPoint $p $pose))}}
$xmin=[double]::PositiveInfinity;$ymin=$xmin;$xmax=[double]::NegativeInfinity;$ymax=$xmax
foreach($p in $all){$xmin=[Math]::Min($xmin,$p[0]);$xmax=[Math]::Max($xmax,$p[0]);$ymin=[Math]::Min($ymin,$p[1]);$ymax=[Math]::Max($ymax,$p[1])}
$xmin=[Math]::Floor($xmin)-1;$xmax=[Math]::Ceiling($xmax)+1;$ymin=[Math]::Floor($ymin)-1;$ymax=[Math]::Ceiling($ymax)+1
function Draw-CloudPanel($g,$left,$top,$width,$height,$pose,$queryBrush,$fixedBrush){
 $scale=[Math]::Min($width/($xmax-$xmin),$height/($ymax-$ymin))
 for($x=$xmin;$x -le $xmax;$x+=2){$sx=$left+($x-$xmin)*$scale;$g.DrawLine($grid,[single]$sx,[single]$top,[single]$sx,[single]($top+($ymax-$ymin)*$scale));$g.DrawString($x.ToString(),$small,$ink,[single]($sx-4),[single]($top+($ymax-$ymin)*$scale+3))}
 for($y=$ymin;$y -le $ymax;$y+=2){$sy=$top+($ymax-$y)*$scale;$g.DrawLine($grid,[single]$left,[single]$sy,[single]($left+($xmax-$xmin)*$scale),[single]$sy);$g.DrawString($y.ToString(),$small,$ink,[single]($left-30),[single]($sy-7))}
 foreach($p in $example.reference.points){$g.FillEllipse($fixedBrush,[single]($left+($p[0]-$xmin)*$scale-2),[single]($top+($ymax-$p[1])*$scale-2),[single]4,[single]4)}
 foreach($p in $example.query.points){$q=Transform-ScanPoint $p $pose;$g.FillEllipse($queryBrush,[single]($left+($q[0]-$xmin)*$scale-2.2),[single]($top+($ymax-$q[1])*$scale-2.2),[single]4.4,[single]4.4)}
}
$selected=$example.results | Where-Object method -eq 'multiresolution' | Select-Object -First 1
$bmp=[System.Drawing.Bitmap]::new(1600,1010);$g=[System.Drawing.Graphics]::FromImage($bmp);$g.Clear([System.Drawing.Color]::White);$g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.DrawString('TP 2 - Localisation entre scans : avant / apres',$title,$ink,45,20)
$g.DrawString(('Bleu : reference fixe. Orange puis vert : scan a localiser. Paire '+$example.id+', initialisation moyenne_a.'),$font,$ink,45,65)
for($panel=0;$panel -lt 2;$panel++){$left=60+780*$panel;$pose=if($panel -eq 0){$example.initial}else{$selected.result.pose};$brush=if($panel -eq 0){$orange}else{$green};$heading=if($panel -eq 0){'AVANT - Pose relative perturbee'}else{'APRES - Multi-resolution'};$g.DrawString($heading,$font,$ink,$left,120);Draw-CloudPanel $g $left 170 650 600 $pose $brush $fixed;$g.DrawString(('x={0:F3} m ; y={1:F3} m ; angle={2:F2} deg' -f $pose.x,$pose.y,$pose.theta),$font,$ink,$left,820);$error=if($panel -eq 0){$selected.initialError}else{$selected.finalError};$g.DrawString(('{0} : {1:F3} m ; {2:F2} deg' -f $errorLabel,$error.positionM,$error.angleDeg),$font,$ink,$left,855)}
$g.DrawString('Axes X/Y en metres, repere local du scan de reference. Meme echelle dans les deux panneaux.',$small,$ink,45,925)
$g.DrawString(('Traces calcules, pas captures du navigateur. '+$referenceLabel),$small,$ink,45,955)
$bmp.Save((Join-Path $folder 'avant_apres.png'),[System.Drawing.Imaging.ImageFormat]::Png);$g.Dispose();$bmp.Dispose()

$bmp=[System.Drawing.Bitmap]::new(1800,1410);$g=[System.Drawing.Graphics]::FromImage($bmp);$g.Clear([System.Drawing.Color]::White);$g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.DrawString('Meme paire et meme pose initiale - comparaison des cinq methodes',$title,$ink,35,20)
$g.DrawString(('Reference en gris ; scan transforme en couleur. Seuil nominal : 0,20 m et 2 deg. '+$(if($PhysicalCampaign){'Paire A/B declaree.'}else{'Poses TP 1 estimees.'})),$font,$ink,35,65)
for($panel=0;$panel -lt 6;$panel++){
 $col=$panel%3;$row=[Math]::Floor($panel/3);$left=55+595*$col;$top=180+590*$row
 if($panel -eq 0){$pose=$example.initial;$heading='Initialisation commune';$brush=$orange;$subtitle='Aucune methode appliquee'}else{$method=$methods[$panel-1];$r=$example.results | Where-Object method -eq $method | Select-Object -First 1;$pose=if($r.result){$r.result.pose}else{$example.initial};$heading=$names[$method];$brush=if($r.success){$green}else{$red};$subtitle=if($r.finalError){'{0:F3} m ; {1:F2} deg ; {2:F0} ms - {3}' -f $r.finalError.positionM,$r.finalError.angleDeg,$r.elapsedMs,$(if($r.success){'REUSSI'}else{'ECHEC'})}else{'REJETE'}}
 $g.DrawString($heading,$font,$ink,$left,$top-65);$g.DrawString($subtitle,$small,$ink,$left,$top-35);Draw-CloudPanel $g $left $top 480 435 $pose $brush $grey
}
$g.DrawString('Le calcul direct associe une seule fois les voisins : il reste ici loin de la bonne pose. Aucun resultat defavorable nest masque.',$font,$ink,35,1360)
$bmp.Save((Join-Path $folder 'comparaison_methodes.png'),[System.Drawing.Imaging.ImageFormat]::Png);$g.Dispose();$bmp.Dispose()

$bmp=[System.Drawing.Bitmap]::new(1400,840);$g=[System.Drawing.Graphics]::FromImage($bmp);$g.Clear([System.Drawing.Color]::White)
$g.DrawString('Sensibilite a linitialisation - taux de reussite sur les scans reels',$title,$ink,35,20)
$g.DrawString('Meme paire et meme perturbation pour toutes les methodes ; seuils : erreur <= 0,20 m ET erreur angulaire <= 2 deg.',$font,$ink,35,65)
$palette=@([System.Drawing.Color]::RoyalBlue,[System.Drawing.Color]::SeaGreen,[System.Drawing.Color]::DarkViolet,[System.Drawing.Color]::DarkOrange,[System.Drawing.Color]::Firebrick)
for($j=0;$j -lt 5;$j++){$b=[System.Drawing.SolidBrush]::new($palette[$j]);$g.FillRectangle($b,45+265*$j,115,16,16);$g.DrawString($names[$methods[$j]],$small,$ink,68+265*$j,110);$b.Dispose()}
$left=105;$top=190;$height=410
for($pct=0;$pct -le 100;$pct+=20){$sy=$top+$height-$pct*$height/100;$g.DrawLine($grid,[single]$left,[single]$sy,1320,[single]$sy);$g.DrawString(($pct.ToString()+' %'),$font,$ink,35,[single]($sy-10))}
$levels=@('proche','moyenne','difficile')
for($level=0;$level -lt 3;$level++){
 for($j=0;$j -lt 5;$j++){$summary=$report.summaries | Where-Object { $_.dataset -eq 'reel' -and $_.method -eq $methods[$j] } | Select-Object -First 1;$rate=$summary.byInitialLevel | Where-Object level -eq $levels[$level] | Select-Object -First 1;$x=150+390*$level+52*$j;$h=$height*$rate.successRate;$b=[System.Drawing.SolidBrush]::new($palette[$j]);$g.FillRectangle($b,[single]$x,[single]($top+$height-$h),[single]40,[single]$h);$g.DrawString(($rate.success.ToString()+'/'+$rate.trials),$small,$ink,[single]$x,[single]($top+$height-$h-23));$b.Dispose()}
 $g.DrawString($levels[$level],$font,$ink,210+390*$level,630)
}
$g.DrawString('Proche : environ 0,15 m / 2 deg ; moyenne : 0,59 m / 8 deg ; difficile : 1,21 m / 14 deg.',$font,$ink,60,700)
$g.DrawString('Le recuit a trois graines ; les repetitions dune paire sont correlees et ne constituent pas de nouvelles acquisitions.',$small,$ink,35,755)
$g.DrawString($referenceLabel,$small,$ink,35,790)
$bmp.Save((Join-Path $folder 'sensibilite_initialisation.png'),[System.Drawing.Imaging.ImageFormat]::Png);$g.Dispose();$bmp.Dispose()
$title.Dispose();$font.Dispose();$small.Dispose();$ink.Dispose();$fixed.Dispose();$orange.Dispose();$green.Dispose();$red.Dispose();$grey.Dispose();$grid.Dispose()
