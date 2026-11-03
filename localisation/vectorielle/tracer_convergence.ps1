$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$folder=Join-Path $PSScriptRoot 'resultats'
$report=Get-Content -LiteralPath (Join-Path $folder 'evaluation_gradient.json') -Raw | ConvertFrom-Json
$example=Get-Content -LiteralPath (Join-Path $folder 'exemple.json') -Raw | ConvertFrom-Json
$trial=$report.real | Where-Object label -eq $example.source | Select-Object -First 1
$trace=$trial.result.trace;$xmax=[Math]::Max(1,$trial.result.iterations);$ymax=$trace[0].cost*1.08
$bmp=[System.Drawing.Bitmap]::new(1200,700);$g=[System.Drawing.Graphics]::FromImage($bmp);$g.Clear([System.Drawing.Color]::White);$g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$title=[System.Drawing.Font]::new('Segoe UI',22,[System.Drawing.FontStyle]::Bold);$font=[System.Drawing.Font]::new('Segoe UI',13)
$ink=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(23,51,77));$pen=[System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(19,106,195),3);$grid=[System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(226,234,241),1)
$g.DrawString('Descente de gradient vectorielle - evolution du cout',$title,$ink,40,20)
$g.DrawString('Exemple reel R1-1 ; cout moyen tronque point-vers-segment (m2).',$font,$ink,40,65)
$left=110;$top=125;$width=1000;$height=440
for($i=0;$i -le 5;$i++){$value=$ymax*$i/5;$sy=$top+$height-$height*$i/5;$g.DrawLine($grid,[single]$left,[single]$sy,[single]($left+$width),[single]$sy);$g.DrawString($value.ToString('F4'),$font,$ink,20,[single]($sy-10))}
for($i=0;$i -le $xmax;$i+=5){$sx=$left+$width*$i/$xmax;$g.DrawLine($grid,[single]$sx,[single]$top,[single]$sx,[single]($top+$height));$g.DrawString($i.ToString(),$font,$ink,[single]($sx-6),[single]($top+$height+10))}
for($i=1;$i -lt $trace.Count;$i++){$a=$trace[$i-1];$b=$trace[$i];$g.DrawLine($pen,[single]($left+$width*$a.iteration/$xmax),[single]($top+$height-$height*$a.cost/$ymax),[single]($left+$width*$b.iteration/$xmax),[single]($top+$height-$height*$b.cost/$ymax))}
$g.DrawString('Iterations (seules les poses initiale et acceptees sont tracees)',$font,$ink,310,600)
$g.DrawString('Arret : aucun pas accepte avec le budget de recherche lineaire ; cela ne prouve pas un optimum global.',$font,$ink,40,650)
$bmp.Save((Join-Path $folder 'convergence_gradient.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose();$bmp.Dispose();$title.Dispose();$font.Dispose();$ink.Dispose();$pen.Dispose();$grid.Dispose()
