'use strict';
const Core = window.LidarCore;
const $ = id => document.getElementById(id);
const canvas = $('canvas'), ctx = canvas.getContext('2d');
const state = { scans: [], selected: null, counter: 0, view: { x: 0, y: 0, scale: 50 }, width: 800, height: 600, drag: null };
function notice(message, error = false) { $('notice').textContent = message; $('notice').classList.toggle('error', error); }
function screen(point) { return [state.width / 2 + (point[0] - state.view.x) * state.view.scale, state.height / 2 - (point[1] - state.view.y) * state.view.scale]; }
function world(x, y) { return [state.view.x + (x - state.width / 2) / state.view.scale, state.view.y - (y - state.height / 2) / state.view.scale]; }
function fit() {
  const pts = state.scans.filter(s => s.visible).flatMap(s => [[s.pose.x, s.pose.y], ...s.points.map(p => Core.transform(p, s.pose))]);
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
  $('empty').style.display = state.scans.length ? 'none' : 'flex';
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
  for (const scan of visible) {
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
  ctx.globalAlpha = 1; ctx.fillStyle = '#344f68'; ctx.font = '12px Segoe UI,Arial';
  ctx.fillText('Y (m)', 10, 24); ctx.fillText('X (m)', Math.max(10, w - 49), h - 31);
  const maxLegend = Math.min(visible.length, Math.max(0, Math.floor((h - 110) / 20)));
  if (maxLegend) {
    const lx = Math.max(65, w - 280), ly = 14;
    ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fillRect(lx - 8, ly - 7, 276, maxLegend * 20 + 10);
    visible.slice(0, maxLegend).forEach((scan, i) => {
      ctx.fillStyle = scan.color; ctx.beginPath(); ctx.arc(lx, ly + i * 20 + 5, 3, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = '#42586f'; ctx.font = '11px Segoe UI,Arial'; const name = `${scan.label} · ${scan.name}`;
      ctx.fillText(name.length > 37 ? name.slice(0, 34) + '…' : name, lx + 12, ly + i * 20 + 9);
    });
  }
  $('metrics').textContent = `${visible.length}/${state.scans.length} scans visibles · ${visible.reduce((n, s) => n + s.points.length, 0).toLocaleString('fr-FR')} points · grille ${label(step)} m`;
  $('count').textContent = String(state.scans.length);
  ['savePoses', 'exportCSV', 'exportPNG'].forEach(id => $(id).disabled = id === 'savePoses' ? !state.scans.length : !visible.length);
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
  const link = document.createElement('a'); link.href = canvas.toDataURL('image/png'); link.download = 'nuages_de_points.png'; link.click();
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
