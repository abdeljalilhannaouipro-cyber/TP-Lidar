param([string]$Resultats = (Join-Path $PSScriptRoot 'resultats'))
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$font=[System.Drawing.Font]::new('Arial',16);$small=[System.Drawing.Font]::new('Arial',13);$title=[System.Drawing.Font]::new('Arial',25,[System.Drawing.FontStyle]::Bold)
$ink=[System.Drawing.Brushes]::DarkSlateGray;$gridPen=[System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(225,232,239),1)
foreach($folder in Get-ChildItem -LiteralPath $Resultats -Directory){
 $input=Join-Path $folder.FullName 'donnees_traces.json';if(-not(Test-Path -LiteralPath $input)){continue}
 $data=Get-Content -LiteralPath $input -Raw -Encoding utf8|ConvertFrom-Json
 $map=Get-Content -LiteralPath (Join-Path $folder.FullName 'grille.json') -Raw -Encoding utf8|ConvertFrom-Json
 $xmin=[double]$data.summary.grid.x;$ymin=[double]$data.summary.grid.y;$xmax=$xmin+[double]$data.summary.grid.width;$ymax=$ymin+[double]$data.summary.grid.height
 $scale=[math]::Min(1080/($xmax-$xmin),800/($ymax-$ymin));$width=($xmax-$xmin)*$scale;$height=($ymax-$ymin)*$scale
 $left=150+(1080-$width)/2;$top=150+(800-$height)/2
 $step=if([math]::Max($xmax-$xmin,$ymax-$ymin) -gt 28){5}else{2}
 $exploratory=$folder.Name.StartsWith('exploratoire')
 foreach($kind in @('alignement','grille','vectorielle')){
  $bmp=[System.Drawing.Bitmap]::new(1400,1370);$g=[System.Drawing.Graphics]::FromImage($bmp);$g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::AntiAlias;$g.Clear([System.Drawing.Color]::White)
  $prefix=if($exploratory){('EXPLORATORY - unvalidated '+$data.summary.scanCount+'-scan frame')}else{$folder.Name+' - estimated local frame'}
  $subject=switch($kind){'alignement'{'Aligned point clouds'}'grille'{'Occupancy grid'}'vectorielle'{'Vector map'}}
  $g.DrawString($subject,$title,$ink,55,25);$g.DrawString($prefix,$font,$ink,55,75)
  $g.DrawString(($data.summary.scanCount.ToString()+' scans | '+$data.summary.validPoints+' valid points | '+$data.summary.vector.features+' vector primitives'),$small,$ink,55,110)
  if($kind -eq 'grille'){
   $g.FillRectangle([System.Drawing.Brushes]::LightGray,[single]$left,[single]$top,[single]$width,[single]$height)
   $free=[System.Drawing.Brushes]::White;$occupied=[System.Drawing.Brushes]::DarkSlateGray;$cw=[single]($map.resolution*$scale)
   for($y=0;$y -lt $map.ny;$y++){for($x=0;$x -lt $map.nx;$x++){
    $v=$map.cells[$y*$map.nx+$x];if($v -eq 127){continue};$brush=if($v -eq 0){$free}else{$occupied}
    $g.FillRectangle($brush,[single]($left+$x*$cw),[single]($top+($map.ny-1-$y)*$cw),$cw,$cw)
   }}
  }
  for($x=[math]::Ceiling($xmin/$step)*$step;$x -le $xmax;$x+=$step){$px=[single]($left+($x-$xmin)*$scale);$g.DrawLine($gridPen,$px,[single]$top,$px,[single]($top+$height));$g.DrawString([string]$x,$small,$ink,($px-9),($top+$height+9))}
  for($y=[math]::Ceiling($ymin/$step)*$step;$y -le $ymax;$y+=$step){$py=[single]($top+($ymax-$y)*$scale);$g.DrawLine($gridPen,[single]$left,$py,[single]($left+$width),$py);$g.DrawString([string]$y,$small,$ink,($left-40),($py-10))}
  $g.DrawString('X (m)',$font,$ink,($left+$width/2),($top+$height+40));$g.DrawString('Y (m)',$font,$ink,($left-45),($top-28))
  if($kind -eq 'alignement'){
   $brushes=@{};foreach($scan in $data.scans){$brushes[$scan.name]=[System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($scan.color))}
   foreach($point in $data.cloud){$px=[single]($left+([double]$point.x-$xmin)*$scale);$py=[single]($top+($ymax-[double]$point.y)*$scale);$g.FillEllipse($brushes[$point.source],($px-1.8),($py-1.8),3.6,3.6)}
   foreach($brush in $brushes.Values){$brush.Dispose()}
  }
  if($kind -eq 'vectorielle'){
   foreach($feature in $data.vector){
    $color=if($feature.misses -gt 0){'#c26b08'}elseif($feature.supportScans.Count -ge 2){'#008468'}else{'#8c3f9b'}
    $pen=[System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml($color),2.8)
    $s=$feature.segment;$g.DrawLine($pen,[single]($left+([double]$s.a[0]-$xmin)*$scale),[single]($top+($ymax-[double]$s.a[1])*$scale),[single]($left+([double]$s.b[0]-$xmin)*$scale),[single]($top+($ymax-[double]$s.b[1])*$scale));$pen.Dispose()
   }
  }
  $i=0;foreach($scan in $data.scans){
   $brush=[System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($scan.color));$pen=[System.Drawing.Pen]::new($brush,2)
   $ox=[single]($left+([double]$scan.pose.x-$xmin)*$scale);$oy=[single]($top+($ymax-[double]$scan.pose.y)*$scale);$theta=[double]$scan.pose.theta*[math]::PI/180
   $g.DrawEllipse($pen,($ox-4),($oy-4),8,8);$g.DrawLine($pen,$ox,$oy,[single]($ox+18*[math]::Cos($theta)),[single]($oy-18*[math]::Sin($theta)))
   if($kind -eq 'alignement'){$g.DrawString($scan.label,$small,$brush,($ox+7),($oy+7))}
   $lx=65+($i%3)*430;$ly=1050+[math]::Floor($i/3)*29
   $g.FillEllipse($brush,$lx,$ly,10,10);$time=$scan.name -replace '^scan_\d{8}_(\d{2})(\d{2})(\d{2}).*$','$1:$2:$3'
   $g.DrawString(($scan.label+'  '+$time),$small,$ink,($lx+18),($ly-5));$i++;$brush.Dispose();$pen.Dispose()
  }
  $legend=switch($kind){'alignement'{'One colour per scan. Sensor origins/arrows show estimated poses.'}'grille'{'White: free | Dark: occupied | Grey: unknown | Resolution: 0.10 m'}'vectorielle'{'Green: >=2 scan supports | Purple: new/initial | Orange: contradicted'}}
  $g.DrawString($legend,$small,$ink,55,1250)
  $warning=if($exploratory){'Weak and ambiguous alignment links included. Do not treat as a validated room map.'}else{'Separate group reference frame. Poses estimated, not surveyed; review the quality report.'}
  $g.DrawString($warning,$small,$ink,55,1300)
  $g.DrawString('All original measurements preserved. Map filters and update order are documented.',$small,$ink,55,1335)
  $bmp.Save((Join-Path $folder.FullName ($kind+'.png')),[System.Drawing.Imaging.ImageFormat]::Png);$g.Dispose();$bmp.Dispose()
 }
 Write-Output ('Traces : '+$folder.Name)
}
