$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$folder=Join-Path $PSScriptRoot 'resultats'
$report=Get-Content -LiteralPath (Join-Path $folder 'evaluation_probabiliste.json') -Raw | ConvertFrom-Json
$example=Get-Content -LiteralPath (Join-Path $folder 'exemple.json') -Raw | ConvertFrom-Json
$trial=$report.real | Where-Object { $_.label -eq $example.source -and $_.seed -eq 20261103 } | Select-Object -First 1
$trace=$trial.result.trace;$xmax=$trial.result.attemptedMoves;$ymax=([double](($trace | Measure-Object -Property currentCost -Maximum).Maximum))*1.08
$bmp=[System.Drawing.Bitmap]::new(1200,730);$g=[System.Drawing.Graphics]::FromImage($bmp);$g.Clear([System.Drawing.Color]::White);$g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$title=[System.Drawing.Font]::new('Segoe UI',22,[System.Drawing.FontStyle]::Bold);$font=[System.Drawing.Font]::new('Segoe UI',12)
$ink=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(23,51,77));$bestPen=[System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(19,106,195),3);$currentPen=[System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(215,135,60),1.5);$grid=[System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(226,234,241),1)
$g.DrawString('Recuit simule vectoriel - exploration et meilleur cout',$title,$ink,35,20)
$g.DrawString('Exemple reel R1-1 ; 8 chaines de 400 tentatives ; graine 20261103. Cout moyen tronque en m2.',$font,$ink,35,65)
$g.DrawLine($currentPen,80,110,120,110);$g.DrawString('Cout courant (peut augmenter)', $font,$ink,130,97)
$g.DrawLine($bestPen,600,110,640,110);$g.DrawString('Meilleur cout rencontre (conserve)', $font,$ink,650,97)
$left=110;$top=150;$width=1000;$height=430
for($i=0;$i -le 5;$i++){$value=$ymax*$i/5;$sy=$top+$height-$height*$i/5;$g.DrawLine($grid,[single]$left,[single]$sy,[single]($left+$width),[single]$sy);$g.DrawString($value.ToString('F3'),$font,$ink,35,[single]($sy-9))}
for($i=0;$i -le $xmax;$i+=400){$sx=$left+$width*$i/$xmax;$g.DrawLine($grid,[single]$sx,[single]$top,[single]$sx,[single]($top+$height));$g.DrawString($i.ToString(),$font,$ink,[single]($sx-15),[single]($top+$height+10))}
foreach($key in @('currentCost','bestCost')){$pen=if($key -eq 'bestCost'){$bestPen}else{$currentPen};for($i=1;$i -lt $trace.Count;$i++){$a=$trace[$i-1];$b=$trace[$i];$g.DrawLine($pen,[single]($left+$width*$a.attempted/$xmax),[single]($top+$height-$height*$a.$key/$ymax),[single]($left+$width*$b.attempted/$xmax),[single]($top+$height-$height*$b.$key/$ymax))}}
$g.DrawString('Tentatives cumulees (les changements de chaine peuvent produire des sauts)',$font,$ink,250,625)
$g.DrawString(($trial.result.uphillMoves.ToString()+' montees acceptees. Trace echantillonnee toutes les 20 tentatives et aux changements de chaine.'),$font,$ink,35,675)
$g.DrawString('La fin du budget ne garantit pas le minimum global ; cette courbe ne represente pas une probabilite de pose.',$font,$ink,35,700)
$bmp.Save((Join-Path $folder 'recuit_probabiliste.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose();$bmp.Dispose();$title.Dispose();$font.Dispose();$ink.Dispose();$bestPen.Dispose();$currentPen.Dispose();$grid.Dispose()
