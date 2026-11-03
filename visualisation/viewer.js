'use strict';
const Core = window.LidarCore;
const $ = id => document.getElementById(id);
const canvas = $('canvas'), ctx = canvas.getContext('2d');
const state = { scans: [], selected: null, counter: 0, view: { x: 0, y: 0, scale: 50 }, width: 800, height: 600, drag: null };
state.grid = null;
state.segments = [];
const gridImage = { grid: null, version: -1, canvas: document.createElement('canvas'), counts: null };
function notice(message, error = false) { $('notice').textContent = message; $('notice').classList.toggle('error', error); }
function screen(point) { return [state.width / 2 + (point[0] - state.view.x) * state.view.scale, state.height / 2 - (point[1] - state.view.y) * state.view.scale]; }
function world(x, y) { return [state.view.x + (x - state.width / 2) / state.view.scale, state.view.y - (y - state.height / 2) / state.view.scale]; }
function fit() {
  const mode=$('viewMode').value;
  const pts = ['grid','segments'].includes(mode) ? [] : state.scans.filter(s => s.visible).flatMap(s => [[s.pose.x, s.pose.y], ...s.points.map(p => Core.transform(p, s.pose))]);
  if (state.grid && ['grid','both'].includes(mode)) pts.push([state.grid.x,state.grid.y],[state.grid.x+state.grid.width,state.grid.y+state.grid.height]);
  if (['segments','segmentsPoints'].includes(mode)) for(const item of state.segments)pts.push(item.segment.a,item.segment.b);
  if (!pts.length) { draw(); return; }
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (const p of pts) { xmin = Math.min(xmin, p[0]); xmax = Math.max(xmax, p[0]); ymin = Math.min(ymin, p[1]); ymax = Math.max(ymax, p[1]); }
  state.view.x = (xmin + xmax) / 2; state.view.y = (ymin + ymax) / 2;
  state.view.scale = Math.max(.05, Math.min(2000, (state.width - 110) / Math.max(xmax - xmin, 1), (state.height - 110) / Math.max(ymax - ymin, 1)));
  draw();
}
function zoom(factor, anchor = [state.width / 2, state.height / 2]) {
  const before = world(...anchor);
  state.view.scale = Math.max(.05, Math.min(2000, state.view.scale * factor));
  const after = world(...anchor); state.view.x += before[0] - after[0]; state.view.y += before[1] - after[1]; draw();
}
function draw() {
  const { width: w, height: h } = state;
  ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
  const visible = state.scans.filter(s => s.visible);
  const showGrid = ['grid','both'].includes($('viewMode').value) && state.grid;
  const showSegments = ['segments','segmentsPoints'].includes($('viewMode').value) && state.segments.length;
  if (showGrid) drawGrid();
  updateGridStatus();
  if(typeof updateSegmentsStatus==='function')updateSegmentsStatus();
  $('empty').style.display = state.scans.length || showGrid || showSegments ? 'none' : 'flex';
  let step = Math.pow(10, Math.floor(Math.log10(80 / state.view.scale)));
  if (step * state.view.scale < 40) step *= 2;
  if (step * state.view.scale < 40) step *= 2.5;
  const tl = world(0, 0), br = world(w, h);
  ctx.lineWidth = 1; ctx.strokeStyle = '#e6ebf0'; ctx.fillStyle = '#7a8b9a'; ctx.font = '11px Segoe UI,Arial';
  const label = v => Math.abs(v) < 1e-9 ? '0' : String(Number(v.toFixed(4)));
  for (let x = Math.ceil(tl[0] / step) * step; x <= br[0]; x += step) {
    const px = screen([x, 0])[0]; ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke(); ctx.fillText(label(x), px + 4, h - 11);
  }
  for (let y = Math.ceil(br[1] / step) * step; y <= tl[1]; y += step) {
    const py = screen([0, y])[1]; ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke(); if (py > 40 && py < h - 35) ctx.fillText(label(y), 9, py - 5);
  }
  const origin = screen([0, 0]); ctx.strokeStyle = '#acbac8';
  ctx.beginPath(); ctx.moveTo(origin[0], 0); ctx.lineTo(origin[0], h); ctx.moveTo(0, origin[1]); ctx.lineTo(w, origin[1]); ctx.stroke();
  const drawn = $('viewMode').value === 'grid' ? (state.grid?.scans || []).map((record,i) => {
    const loaded=state.scans.find(s=>s.name===record.name&&s.checksum===record.checksum);
    return {name:record.name,pose:record.pose,points:[],color:loaded?.color||Core.color(i),label:loaded?.label||`G${i+1}`,id:loaded?.id,opacity:1};
  }) : $('viewMode').value==='segments' ? [] : visible;
  for (const scan of drawn) {
    ctx.globalAlpha = scan.opacity; ctx.fillStyle = scan.color;
    for (const point of scan.points) {
      const [x, y] = screen(Core.transform(point, scan.pose));
      if (x < -3 || y < -3 || x > w + 3 || y > h + 3) continue;
      ctx.beginPath(); ctx.arc(x, y, 1.9, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const [x, y] = screen([scan.pose.x, scan.pose.y]);
    const a = scan.pose.theta * Math.PI / 180;
    ctx.strokeStyle = scan.color; ctx.lineWidth = scan.id === state.selected ? 2.8 : 1.8;
    ctx.beginPath(); ctx.arc(x, y, scan.id === state.selected ? 7 : 5, 0, Math.PI * 2); ctx.stroke();
    const ex = x + 25 * Math.cos(a), ey = y - 25 * Math.sin(a);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.lineTo(ex - 7 * Math.cos(a - .4), ey + 7 * Math.sin(a - .4)); ctx.moveTo(ex, ey); ctx.lineTo(ex - 7 * Math.cos(a + .4), ey + 7 * Math.sin(a + .4)); ctx.stroke();
    ctx.font = 'bold 12px Segoe UI,Arial'; ctx.fillText(scan.label, x + 9, y + 17);
  }
  if(showSegments && typeof drawSegments==='function')drawSegments();
  ctx.globalAlpha = 1; ctx.fillStyle = '#344f68'; ctx.font = '12px Segoe UI,Arial';
  ctx.fillText('Y (m)', 10, 24); ctx.fillText('X (m)', Math.max(10, w - 49), h - 31);
  const maxLegend = Math.min(drawn.length, Math.max(0, Math.floor((h - 110) / 20)));
  if (maxLegend) {
    const lx = Math.max(65, w - 280), ly = 14;
    ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fillRect(lx - 8, ly - 7, 276, maxLegend * 20 + 10);
    drawn.slice(0, maxLegend).forEach((scan, i) => {
      ctx.fillStyle = scan.color; ctx.beginPath(); ctx.arc(lx, ly + i * 20 + 5, 3, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = '#42586f'; ctx.font = '11px Segoe UI,Arial'; const name = `${scan.label} · ${scan.name}`;
      ctx.fillText(name.length > 37 ? name.slice(0, 34) + '…' : name, lx + 12, ly + i * 20 + 9);
    });
  }
  $('metrics').textContent = `${visible.length}/${state.scans.length} scans visibles · ${visible.reduce((n, s) => n + s.points.length, 0).toLocaleString('fr-FR')} points · ${state.segments.length} segments · repère ${label(step)} m`;
  $('count').textContent = String(state.scans.length);
  ['savePoses', 'exportCSV', 'exportPNG'].forEach(id => $(id).disabled = id === 'savePoses' ? !state.scans.length : id === 'exportPNG' ? !visible.length&&!showGrid&&!showSegments : !visible.length);
}
function drawGrid() {
  const grid=state.grid;
  if(gridImage.grid!==grid||gridImage.version!==grid.version){
    const buffer=gridImage.canvas;buffer.width=grid.nx;buffer.height=grid.ny;
    const context=buffer.getContext('2d'),image=context.createImageData(grid.nx,grid.ny);
    for(let y=0;y<grid.ny;y++)for(let x=0;x<grid.nx;x++){
      const value=grid.cells[y*grid.nx+x],i=((grid.ny-1-y)*grid.nx+x)*4;
      const color=value===0?[255,255,255]:value===255?[37,55,71]:[220,224,229];
      image.data[i]=color[0];image.data[i+1]=color[1];image.data[i+2]=color[2];image.data[i+3]=255;
    }
    context.putImageData(image,0,0);gridImage.grid=grid;gridImage.version=grid.version;gridImage.counts=grid.counts();
  }
  const [left,top]=screen([grid.x,grid.y+grid.height]);ctx.imageSmoothingEnabled=false;
  ctx.drawImage(gridImage.canvas,left,top,grid.width*state.view.scale,grid.height*state.view.scale);
  ctx.strokeStyle='#61788c';ctx.lineWidth=1;ctx.strokeRect(left,top,grid.width*state.view.scale,grid.height*state.view.scale);
}
function updateGridStatus(){
  const grid=state.grid;
  $('gridSave').disabled=!grid;$('gridCSV').disabled=!grid;
  const selected=state.scans.find(s=>s.id===state.selected);
  $('gridSelected').disabled=!selected;$('gridSelected').textContent=selected?`Intégrer ${selected.label}`:'Intégrer le scan sélectionné';$('gridSelected').title=selected?selected.name:'Sélectionner une fiche de scan';
  $('gridVisible').disabled=!state.scans.some(s=>s.visible);
  if(!grid){$('gridStatus').textContent='Aucune grille. Régler les poses avant d’intégrer les scans.';return;}
  if(gridImage.grid!==grid||gridImage.version!==grid.version)gridImage.counts=grid.counts();
  const c=gridImage.counts;
  const stale=grid.scans.filter(record=>{const s=state.scans.find(s=>s.name===record.name&&s.checksum===record.checksum);return s&&['x','y','theta'].some(k=>s.pose[k]!==record.pose[k]);}).length;
  $('gridStatus').textContent=`${grid.nx} × ${grid.ny} cellules · ${grid.resolution} m/cellule · ${grid.scans.length} scan(s) intégré(s). Libres : ${c.free} ; occupées : ${c.occupied} ; inconnues : ${c.unknown}.${stale?' ATTENTION : '+stale+' pose(s) modifiée(s) depuis intégration. Recréer la grille.':''}`;
}
function gridFromFields(){
  const number=id=>{if(!$(id).value.trim())throw new Error('Compléter les paramètres de grille.');return Number($(id).value);};
  return new LidarGrid.Grid({resolution:number('gridResolution'),width:number('gridWidth'),height:number('gridHeight'),x:number('gridX'),y:number('gridY')});
}
function integrateScans(scans){
  try{
    if(!scans.length)throw new Error('Charger et sélectionner un scan.');
    const next=state.grid?LidarGrid.Grid.load(state.grid.save()):gridFromFields();
    let added=0,duplicates=0,filtered=0,clipped=0;
    for(const scan of scans){const result=next.integrate(scan,Core.transform,{minIntensity:Number($('gridIntensity').value),maxRange:Number($('gridRange').value)});result.duplicate?duplicates++:added++;filtered+=result.filtered;clipped+=result.clipped;}
    state.grid=next;$('viewMode').value='both';fit();
    notice(`${added} scan(s) intégré(s), ${duplicates} déjà présent(s), ${filtered} mesure(s) filtrée(s), ${clipped} rayon(s) limité(s) au bord. Les impacts hors carte ne créent pas d’obstacle au bord.`);
  }catch(error){notice(error.message,true);}
}
function renderCards() {
  $('scans').replaceChildren();
  for (const scan of state.scans) {
    const card = document.createElement('div'); card.tabIndex = 0; card.className = 'card'; card.classList.toggle('selected', state.selected === scan.id); card.style.setProperty('--scan-color', scan.color);
    const top = document.createElement('div'); top.className = 'card-top';
    const visible = document.createElement('input'); visible.type = 'checkbox'; visible.checked = scan.visible; visible.setAttribute('aria-label', `Afficher ${scan.name}`);
    visible.onchange = () => { scan.visible = visible.checked; draw(); };
    const name = document.createElement('span'); name.className = 'name'; name.textContent = `${scan.label} · ${scan.name}`;
    const remove = document.createElement('button'); remove.className = 'remove'; remove.textContent = '×'; remove.title = `Retirer ${scan.name}`; remove.setAttribute('aria-label', remove.title);
    remove.onclick = event => { event.stopPropagation(); state.scans = state.scans.filter(s => s !== scan); if (state.selected === scan.id) state.selected = state.scans[0]?.id ?? null; renderCards(); draw(); };
    top.append(visible, name, remove); card.append(top);
    const stats = document.createElement('div'); stats.className = 'stats'; stats.textContent = `${scan.points.length} points · ${scan.basis}`; card.append(stats);
    const fields = document.createElement('div'); fields.className = 'fields';
    for (const [key, text, step] of [['x', 'X (m)', .1], ['y', 'Y (m)', .1], ['theta', 'Angle (°)', 1]]) {
      const label = document.createElement('label'); label.textContent = text;
      const input = document.createElement('input'); input.type = 'number'; input.step = String(step); input.value = String(Number(scan.pose[key].toFixed(4))); input.dataset.pose = key; input.dataset.scan = String(scan.id); input.setAttribute('aria-label', `${text} de ${scan.label}`);
      input.oninput = () => {
        if (!input.value.trim() || !Number.isFinite(Number(input.value)) || !input.validity.valid) { input.setAttribute('aria-invalid', 'true'); return; }
        input.removeAttribute('aria-invalid'); scan.pose[key] = Number(input.value); state.selected = scan.id;
        if (key === 'theta') slider.value = String(((scan.pose.theta + 180) % 360 + 360) % 360 - 180);
        highlight(); draw();
      };
      label.append(input); fields.append(label);
    }
    card.append(fields);
    const slider = document.createElement('input'); slider.className = 'rotation'; slider.type = 'range'; slider.min = '-180'; slider.max = '180'; slider.step = '.5'; slider.value = String(((scan.pose.theta + 180) % 360 + 360) % 360 - 180); slider.setAttribute('aria-label', `Rotation de ${scan.label}`);
    slider.oninput = () => { scan.pose.theta = Number(slider.value); state.selected = scan.id; fields.querySelector('[data-pose="theta"]').value = slider.value; highlight(); draw(); }; card.append(slider);
    const footer = document.createElement('div'); footer.className = 'card-footer';
    const reset = document.createElement('button'); reset.textContent = 'Remettre à zéro'; reset.onclick = () => { scan.pose = { x: 0, y: 0, theta: 0 }; renderCards(); draw(); };
    const opacityLabel = document.createElement('label'); opacityLabel.textContent = 'Opacité'; const opacity = document.createElement('input'); opacity.type = 'range'; opacity.min = '.1'; opacity.max = '1'; opacity.step = '.05'; opacity.value = String(scan.opacity); opacity.setAttribute('aria-label', `Opacité de ${scan.label}`); opacity.oninput = () => { scan.opacity = Number(opacity.value); draw(); }; opacityLabel.append(opacity); footer.append(reset, opacityLabel); card.append(footer);
    if (scan.invalid || scan.wraps) {
      const warning = document.createElement('div'); warning.className = 'warning'; warning.textContent = [scan.invalid ? `${scan.invalid} distance(s) nulle(s) ou négative(s) exclue(s).` : '', scan.wraps ? `${scan.wraps} passage(s) angulaire(s) par zéro : vérifier qu’il s’agit d’un seul tour.` : ''].filter(Boolean).join(' '); card.append(warning);
    }
    card.dataset.scan = String(scan.id); card.onclick = event => { state.selected = scan.id; if (!/^(INPUT|BUTTON)$/.test(event.target.tagName)) card.focus({ preventScroll: true }); highlight(); draw(); };
    $('scans').append(card);
  }
}
function highlight() { document.querySelectorAll('.card').forEach(card => card.classList.toggle('selected', Number(card.dataset.scan) === state.selected)); }
function add(scan) {
  if (state.scans.some(s => s.checksum === scan.checksum && s.points.length === scan.points.length)) return false;
  const i = state.counter++; scan.id = i; scan.label = `S${i + 1}`; scan.color = Core.color(i); state.scans.push(scan); state.selected = scan.id; return true;
}
function download(name, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('open').onclick = () => $('files').click();
$('files').onchange = async event => {
  let loaded = 0, duplicates = 0; const errors = [];
  for (const file of event.target.files) {
    try { const scan = Core.parseScan(await file.text(), file.name, $('angleMode').value === 'cw'); add(scan) ? loaded++ : duplicates++; }
    catch (error) { errors.push(`${file.name} : ${error.message}`); }
  }
  renderCards(); fit(); notice(`${loaded} scan(s) ajouté(s), ${duplicates} doublon(s) ignoré(s). ${errors.join(' ')}`, !!errors.length); event.target.value = '';
};
$('examples').onclick = () => {
  let loaded = 0;
  for (const data of window.LIDAR_EXAMPLES || []) if (add(Core.parseScan(data.text, data.name))) loaded++;
  renderCards(); fit(); notice(`${loaded} scan(s) réel(s) ajouté(s). Les deux captures longues sont remplacées par leurs séquences contrôlées « tour2 ». Poses initiales nulles : ajustez-les manuellement.`);
};
$('fit').onclick = fit; $('zoomIn').onclick = () => zoom(1.25); $('zoomOut').onclick = () => zoom(.8);
$('savePoses').onclick = () => download('poses_manuelles.json', Core.savePoses(state.scans), 'application/json');
$('exportCSV').onclick = () => download('points_transformes.csv', Core.exportPoints(state.scans), 'text/csv;charset=utf-8');
$('exportPNG').onclick = () => {
  const link = document.createElement('a'); link.href = canvas.toDataURL('image/png'); link.download = $('viewMode').value==='points'?'nuages_de_points.png':['segments','segmentsPoints'].includes($('viewMode').value)?'segments.png':'grille_occupation.png'; link.click();
};
$('viewMode').onchange=()=>fit();
$('gridNew').onclick=()=>{try{state.grid=gridFromFields();$('viewMode').value='grid';fit();notice('Nouvelle grille : toutes les cellules sont inconnues. Intégrer un scan pour commencer.');}catch(error){notice(error.message,true);}};
$('gridSelected').onclick=()=>integrateScans(state.scans.filter(s=>s.id===state.selected));
$('gridVisible').onclick=()=>integrateScans(state.scans.filter(s=>s.visible));
$('gridSave').onclick=()=>{if(state.grid)download('grille_occupation.json',state.grid.save(),'application/json');};
$('gridCSV').onclick=()=>{if(state.grid)download('grille_occupation.csv',state.grid.csv(),'text/csv;charset=utf-8');};
$('gridLoad').onclick=()=>$('gridFile').click();
$('gridFile').onchange=async event=>{
  try{const file=event.target.files[0];if(!file)return;const grid=LidarGrid.Grid.load(await file.text());state.grid=grid;
    for(const[id,value]of Object.entries({gridResolution:grid.resolution,gridWidth:grid.width,gridHeight:grid.height,gridX:grid.x,gridY:grid.y}))$(id).value=String(value);
    $('viewMode').value='grid';fit();notice('Grille rechargée. Charger et positionner de nouveaux scans pour la mettre à jour. Les scans déjà intégrés sont mémorisés.');
  }catch(error){notice(error.message,true);}finally{event.target.value='';}
};
$('loadPoses').onclick = () => $('poseFile').click();
$('poseFile').onchange = async event => {
  try { const file = event.target.files[0]; if (!file) return; const updates = Core.readPoses(await file.text(), state.scans); updates.forEach(u => { u.scan.pose = u.pose; u.scan.visible = u.visible; }); renderCards(); fit(); notice(`${updates.length} pose(s) restaurée(s).`); }
  catch (error) { notice(error.message, true); } finally { event.target.value = ''; }
};
canvas.addEventListener('wheel', event => { event.preventDefault(); const rect = canvas.getBoundingClientRect(); zoom(Math.exp(-event.deltaY * .001), [event.clientX - rect.left, event.clientY - rect.top]); }, { passive: false });
canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  canvas.focus({ preventScroll: true });
  const scan = state.scans.find(s => s.id === state.selected && s.visible);
  if ($('dragMode').value === 'scan' && !scan) { notice('Sélectionnez un scan visible dans la liste.', true); return; }
  state.drag = { x: event.clientX, y: event.clientY, mode: $('dragMode').value, scan }; canvas.setPointerCapture(event.pointerId); canvas.style.cursor = 'grabbing';
});
canvas.addEventListener('pointermove', event => {
  if (!state.drag) return; const d = state.drag, dx = (event.clientX - d.x) / state.view.scale, dy = -(event.clientY - d.y) / state.view.scale;
  if (d.mode === 'pan') { state.view.x -= dx; state.view.y -= dy; }
  else { d.scan.pose.x += dx; d.scan.pose.y += dy;
    for (const key of ['x', 'y']) { const input = document.querySelector(`input[data-scan="${d.scan.id}"][data-pose="${key}"]`); if (input) input.value = d.scan.pose[key].toFixed(3); }
  }
  d.x = event.clientX; d.y = event.clientY; draw();
});
function endDrag() { state.drag = null; canvas.style.cursor = 'grab'; }
canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
window.addEventListener('keydown', event => {
  if (/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(event.target.tagName) || event.ctrlKey || event.altKey || event.metaKey) return;
  const scan = state.scans.find(s => s.id === state.selected); if (!scan) return;
  const delta = event.shiftKey ? .5 : .1;
  if (event.key === 'ArrowLeft') scan.pose.x -= delta;
  else if (event.key === 'ArrowRight') scan.pose.x += delta;
  else if (event.key === 'ArrowUp') scan.pose.y += delta;
  else if (event.key === 'ArrowDown') scan.pose.y -= delta;
  else if (event.key.toLowerCase() === 'q') scan.pose.theta -= 1;
  else if (event.key.toLowerCase() === 'e') scan.pose.theta += 1;
  else return;
  event.preventDefault(); renderCards(); draw();
});
new ResizeObserver(entries => { const r = entries[0].contentRect; state.width = r.width; state.height = r.height;
  const dpr = window.devicePixelRatio || 1; canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw();
}).observe(canvas.parentElement);
draw();
if (new URLSearchParams(location.search).has('demo')) $('examples').click();
