param([string]$Results=(Join-Path $PSScriptRoot 'resultats'))
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$title=[System.Drawing.Font]::new('Segoe UI',23,[System.Drawing.FontStyle]::Bold)
$font=[System.Drawing.Font]::new('Segoe UI',13)
$small=[System.Drawing.Font]::new('Segoe UI',11)
$ink=[System.Drawing.Brushes]::DarkSlateGray
foreach($folder in Get-ChildItem -LiteralPath $Results -Directory){
 $data=Get-Content -LiteralPath (Join-Path $folder.FullName 'donnees_traces.json') -Raw -Encoding utf8|ConvertFrom-Json
 $grid=$data.grid;$r=[double]$grid.resolution
 $xmin=[double]::PositiveInfinity;$xmax=[double]::NegativeInfinity;$ymin=[double]::PositiveInfinity;$ymax=[double]::NegativeInfinity
 for($j=0;$j -lt $grid.ny;$j++){for($i=0;$i -lt $grid.nx;$i++){if($grid.cells[$j*$grid.nx+$i] -ne 127){
  $xmin=[Math]::Min($xmin,$grid.x+$i*$r);$xmax=[Math]::Max($xmax,$grid.x+($i+1)*$r);$ymin=[Math]::Min($ymin,$grid.y+$j*$r);$ymax=[Math]::Max($ymax,$grid.y+($j+1)*$r)
 }}}
 if(-not [double]::IsFinite($xmin)){continue}
 $xmin-=.6;$xmax+=.6;$ymin-=.6;$ymax+=.6
 $scale=[Math]::Min(980/($xmax-$xmin),750/($ymax-$ymin));$cx=($xmin+$xmax)/2;$cy=($ymin+$ymax)/2
 function SX([double]$x){return [single](700+($x-$cx)*$scale)}
 function SY([double]$y){return [single](545-($y-$cy)*$scale)}
 $bmp=[System.Drawing.Bitmap]::new(1400,1160);$g=[System.Drawing.Graphics]::FromImage($bmp);$g.Clear([System.Drawing.Color]::White)
 $g.DrawString('TP 3 - Localisation et cartographie incrementales',$title,$ink,45,25)
 $g.DrawString(($folder.Name+' | '+$data.summary.acceptedScans+'/'+$data.summary.inputScans+' scans integres (premier = origine)'),$font,$ink,45,78)
 $g.FillRectangle([System.Drawing.Brushes]::LightGray,170,150,1060,800)
 $hit=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(37,55,71))
 for($j=0;$j -lt $grid.ny;$j++){for($i=0;$i -lt $grid.nx;$i++){
  $v=$grid.cells[$j*$grid.nx+$i];if($v -eq 127){continue};$brush=if($v -eq 0){[System.Drawing.Brushes]::White}else{$hit}
  $g.FillRectangle($brush,(SX ($grid.x+$i*$r)),(SY ($grid.y+($j+1)*$r)),[single]($r*$scale+.3),[single]($r*$scale+.3))
 }}
 $gridPen=[System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(220,228,235),1)
 for($x=[Math]::Ceiling($xmin);$x -le $xmax;$x++){$g.DrawLine($gridPen,(SX $x),[single]150,(SX $x),[single]950);$g.DrawString($x.ToString('0'),$small,$ink,(SX $x),958)}
 for($y=[Math]::Ceiling($ymin);$y -le $ymax;$y++){$g.DrawLine($gridPen,[single]170,(SY $y),[single]1230,(SY $y));$g.DrawString($y.ToString('0'),$small,$ink,132,(SY $y))}
 $pen=[System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(16,86,181),3)
 for($i=0;$i -lt $data.scans.Count;$i++){$p=$data.scans[$i].pose;if($i){$old=$data.scans[$i-1].pose;$g.DrawLine($pen,(SX $old.x),(SY $old.y),(SX $p.x),(SY $p.y))};$g.FillEllipse([System.Drawing.Brushes]::RoyalBlue,[single]((SX $p.x)-4),[single]((SY $p.y)-4),8,8)}
 if($data.expected){$truthPen=[System.Drawing.Pen]::new([System.Drawing.Color]::ForestGreen,2);$truthPen.DashStyle=[System.Drawing.Drawing2D.DashStyle]::Dash
  for($i=1;$i -lt $data.expected.Count;$i++){$a=$data.expected[$i-1];$b=$data.expected[$i];$g.DrawLine($truthPen,(SX $a.x),(SY $a.y),(SX $b.x),(SY $b.y))};$truthPen.Dispose()
 }
 $g.DrawString('X (m)',$font,$ink,1240,925);$g.DrawString('Y (m)',$font,$ink,112,120)
 $g.DrawString('Blanc : libre | sombre : occupe | gris : inconnu | bleu : trajet estime',$font,$ink,45,1000)
 $caption=if($data.expected){'Vert pointille : trajet simule connu, utilise seulement pour evaluation.'}else{'Poses estimees. Aucun controle metrique independant de la couverture de la salle.'}
 $g.DrawString($caption,$font,$ink,45,1040)
 $g.DrawString('Localisation AVANT insertion. Rejets exclus de la carte. Pas de fermeture de boucle globale.',$small,$ink,45,1090)
 $bmp.Save((Join-Path $folder.FullName 'carte_slam.png'),[System.Drawing.Imaging.ImageFormat]::Png)
 $g.Dispose();$bmp.Dispose();$pen.Dispose();$hit.Dispose();$gridPen.Dispose()
 Write-Output ('Trace : '+$folder.Name)
}
