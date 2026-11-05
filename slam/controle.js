'use strict';
const $ = id => document.getElementById(id);
const buttons = [...document.querySelectorAll('[data-move]')];
const keys = {ArrowUp:'forward',ArrowDown:'backward',ArrowLeft:'left',ArrowRight:'right',q:'rotateleft',e:'rotateright'};
const labels = {forward:'avancer',backward:'reculer',left:'translation gauche',right:'translation droite',rotateleft:'rotation gauche',rotateright:'rotation droite'};
let live = false, scanBusy = false, latestPoints = [], lastScanTime = 0;
let diagnosticBusy = false;
let token = '', sequence = 0, active = null, held = null, pending = false, generation = 0;
if (location.hostname === '192.168.4.1') $('address').value = location.origin;
function message(text) { $('status').textContent = text; }
function render() {
  buttons.forEach(b => { b.disabled = !token; b.classList.toggle('pressed', b.dataset.move === active); });
  $('connect').disabled = !!token; $('address').disabled = !!token;
  $('speedValue').textContent = $('speed').value;
}
async function api(path) {
  const response = await fetch($('address').value.replace(/\/$/,'') + path, {cache:'no-store',signal:AbortSignal.timeout(1000)});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
function command(action) {
  return api(`/api/command?token=${encodeURIComponent(token)}&seq=${++sequence}&action=${action}&speed=${$('speed').value}`);
}
function halt(label = 'Arrêt demandé.') {
  active = null; held = null; generation++; render();
  const request = token ? command('stop') : api('/api/stop');
  message(label);
  request.then(() => { if (!active) message('ARRÊT — commande transmise à la carte moteur.'); })
    .catch(error => { token = ''; render(); message(`Arrêt non confirmé : ${error.message}. Couper les moteurs si nécessaire.`); });
}
async function pulse() {
  if (!active || !token || pending) return;
  pending = true;
  const version = generation, action = active;
  try {
    await command(action);
    if (version === generation) message(`Commande reçue : ${labels[action]} · PWM ${$('speed').value}/255`);
  } catch (error) {
    if (version === generation) { halt(); token = ''; render(); message(`Commande interrompue : ${error.message}. Reconnecter.`); }
  } finally { pending = false; }
}
function start(action, source) {
  if (!token || active || pending) return;
  active = action; held = source; generation++; render(); pulse();
}
$('connect').onclick = async () => {
  const version = ++generation;
  $('connect').disabled = true; message('Connexion et vérification de la carte moteur…');
  try {
    const data = await api('/api/connect');
    if (version !== generation) return;
    if (data.firmware !== 'Robot_Lidar_v3') throw new Error('Téléverser le programme Robot Lidar v3.');
    live = true; token = data.motorAck && data.token ? String(data.token) : ''; sequence = 0; generation++;
    $('motorStatus').textContent = data.motorAck ? 'Carte moteur : réponse I2C reçue sur SDA19 / SCL21.' : 'Carte moteur absente : vérifier batterie, masse, SDA19 et SCL21. Le scan reste disponible.';
    message(token ? 'PRÊT — maintenir une flèche ou un bouton. Relâcher pour arrêter.' : 'Déplacement désactivé : carte moteur sans réponse.');
    pollScan(); $('keyboard').focus();
  } catch (error) { if (version === generation) { token = ''; message(`Connexion impossible : ${error.message}`); } }
  finally { render(); }
};
$('stop').onclick = () => halt(); $('speed').oninput = render;
buttons.forEach(button => {
  button.onpointerdown = event => {
    if (event.button !== 0) return;
    event.preventDefault(); button.setPointerCapture(event.pointerId);
    start(button.dataset.move, `pointer:${event.pointerId}`);
  };
  button.onpointerup = button.onpointercancel = button.onlostpointercapture = event => {
    if (held === `pointer:${event.pointerId}`) halt();
  };
});
function editing(target) { return target && (target.isContentEditable || ['INPUT','TEXTAREA','SELECT'].includes(target.tagName)); }
document.addEventListener('keydown', event => {
  if (event.key === ' ' || event.key === 'Escape') { event.preventDefault(); if (!event.repeat) halt(); return; }
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (!keys[key] || editing(event.target) || event.ctrlKey || event.altKey || event.metaKey) return;
  event.preventDefault(); if (!event.repeat) start(keys[key], key);
});
document.addEventListener('keyup', event => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (key === held) { event.preventDefault(); halt(); }
});
window.addEventListener('blur', () => { if (token) halt(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && token) halt(); });
window.addEventListener('pagehide', () => { if (token) halt(); });
setInterval(pulse, 120); render();

// Format du cours : 6 octets de pose, n uint16 LE, puis n × (angle, distance, intensité).
function decodeScan(buffer) {
  const data = new DataView(buffer);
  if (buffer.byteLength < 8) throw new Error('Paquet lidar incomplet.');
  const n = data.getUint16(6,true);
  if (n < 100 || n > 1200 || buffer.byteLength !== 8 + 5*n) throw new Error('Taille de scan invalide.');
  const points = [];
  for (let i=0; i<n; i++) {
    const o=8+5*i, angle=data.getUint16(o,true)/100, distance=data.getUint16(o+2,true)/1000;
    if (angle >= 360) throw new Error('Angle lidar invalide.');
    if (distance > 0 && distance <= 12) {
      const a=angle*Math.PI/180;points.push({x:distance*Math.cos(a),y:distance*Math.sin(a)});
    }
  }
  return points;
}
function drawScan(stale=false) {
  const canvas=$('scan'), ctx=canvas.getContext('2d'), size=canvas.width, c=size/2;
  const radius=Number($('range').value), scale=(c-25)/radius;
  ctx.fillStyle='#101e30';ctx.fillRect(0,0,size,size);
  ctx.strokeStyle='#33465d';ctx.fillStyle='#a8bed5';ctx.font='14px system-ui';ctx.lineWidth=1;
  for(let r=1;r<=radius;r++){ctx.beginPath();ctx.arc(c,c,r*scale,0,Math.PI*2);ctx.stroke();if(r%2===0||r===1)ctx.fillText(`${r} m`,c+5,c-r*scale+16);}
  ctx.beginPath();ctx.moveTo(20,c);ctx.lineTo(size-20,c);ctx.moveTo(c,20);ctx.lineTo(c,size-20);ctx.stroke();
  ctx.fillStyle='#a8bed5';ctx.fillText('X · 0°',size-70,c-10);ctx.fillText('Y · 90°',c+10,22);
  ctx.fillStyle=stale?'#718096':'#43ded0';
  for(const p of latestPoints){if(Math.hypot(p.x,p.y)<=radius)ctx.fillRect(c+p.x*scale-1.5,c-p.y*scale-1.5,3,3);}
  ctx.fillStyle='#ffbc65';ctx.beginPath();ctx.arc(c,c,6,0,Math.PI*2);ctx.fill();
  if(stale){ctx.fillStyle='#ffd19a';ctx.fillText('DERNIER SCAN — données non actualisées',24,size-20);}
}
async function pollScan() {
  if (!live || scanBusy || document.hidden) return;
  scanBusy=true;
  try {
    const r=await fetch($('address').value.replace(/\/$/,'')+'/scan',{cache:'no-store',signal:AbortSignal.timeout(1200)});
    if (!r.ok) { let text='Pas de scan récent.';try{text=(await r.json()).error||text;}catch{}throw new Error(text); }
    const points=decodeScan(await r.arrayBuffer());
    latestPoints=points;lastScanTime=Date.now();drawScan();
    $('lidarStatus').textContent=`LIVE · ${points.length} points valides · ${new Date(lastScanTime).toLocaleTimeString('fr-FR')}`;
  } catch(error) {
    drawScan(true);$('lidarStatus').textContent=`Lidar : ${error.message}${lastScanTime?' Dernier scan conservé, non actualisé.':''}`;
  } finally {scanBusy=false;}
}
$('range').onchange=()=>drawScan(lastScanTime && Date.now()-lastScanTime>1500);
setInterval(pollScan,300);
async function pollDiagnostic() {
  if (!live || diagnosticBusy || document.hidden) return;
  diagnosticBusy=true;
  try {
    const d=await api('/api/status');
    if(d.firmware!=='Robot_Lidar_v3') throw new Error('Version du programme différente.');
    $('motorStatus').textContent=d.motorAck
      ? `Carte moteur détectée · ordre logiciel : ${labels[d.action]||'arrêt'}. Mouvement physique non mesuré.`
      : 'Carte moteur sans réponse lors du test. Vérifier alimentation, SDA19 et SCL21 puis reconnecter.';
    if(!lastScanTime) $('lidarStatus').textContent=`Lidar : ${d.scans} tours reçus · ${d.crcErrors} erreurs CRC. Vérifier TX → GPIO33 et l’alimentation si aucun tour n’arrive.`;
  } catch(error) { $('motorStatus').textContent=`Diagnostic robot indisponible : ${error.message}`; }
  finally { diagnosticBusy=false; }
}
setInterval(pollDiagnostic,1500);
drawScan();
