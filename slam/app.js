'use strict';
const $=id=>document.getElementById(id),C=LidarCore;
const ui={session:new LidarSlam.Session(),scans:[],priors:null,truths:null,cursor:0,busy:false,playing:false,version:0,
 raw:[],rawSeen:new Set(),received:0,skipped:0,invalid:0,port:null,reader:null,serialRunning:false,serialConnecting:false,wifiRunning:false,wifiAbort:null};
window.slamApp=ui;
const canvas=$('canvas'),ctx=canvas.getContext('2d');
function notice(text,error=false){$('notice').textContent=text;$('notice').classList.toggle('error',error);}
function value(id){const text=$(id).value;if(!String(text).trim()||!Number.isFinite(Number(text)))throw Error('Paramètre numérique invalide.');return Number(text);}
function download(name,text,type='application/json'){const url=URL.createObjectURL(new Blob([text],{type})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function liveStatus(){
 const last=ui.session.events.at(-1);
 const state=ui.raw.length>=300?'LIMITE DE 300 CAPTURES ATTEINTE — acquisition arrêtée ; exporter avant de poursuivre. ':$('liveMapping').checked?'CARTOGRAPHIE ACTIVE. ':ui.raw.length?`CARTE EN PAUSE — les nouvelles captures ne sont pas ajoutées à la carte.${last?.status==='rejected'?' Dernier refus : '+last.reasons.join(', ')+'.':''} `:'';
 $('liveStatus').textContent=state+`${ui.serialRunning?'USB connecté. ':''}${ui.wifiRunning?'Wi-Fi actif. ':''}${ui.received} blocs reçus ; ${ui.raw.length} captures distinctes conservées ; ${ui.invalid} blocs invalides ; ${ui.skipped} scans non intégrés pendant un calcul. Aucun ordre moteur envoyé.`;
 $('serial').disabled=ui.serialRunning||ui.serialConnecting||ui.wifiRunning;$('wifi').disabled=ui.serialRunning||ui.serialConnecting||ui.wifiRunning;
}
function refresh(){
 for(const id of ['simulation','room','import','reset','load','save','grid'])$(id).disabled=ui.busy||ui.playing;
 $('next').disabled=ui.busy||ui.playing||ui.cursor>=ui.scans.length;$('play').disabled=ui.busy||ui.playing||ui.cursor>=ui.scans.length;
 const s=ui.session,counts=s.grid.counts(),last=s.events.at(-1),p=s.lastPose;
 $('stats').textContent=`${s.accepted.length} scan(s) intégré(s) ; ${s.events.filter(e=>e.status==='rejected').length} refusé(s)\n${counts.free} cellules libres ; ${counts.occupied} occupées ; ${counts.unknown} inconnues\n${p?`Dernière pose : x=${p.x.toFixed(3)} m ; y=${p.y.toFixed(3)} m ; θ=${p.theta.toFixed(2)}°`:'Premier scan : origine à définir.'}\n${last?`${last.name} : ${last.status==='anchor'?'origine du repère':last.status==='accepted'?'intégré':last.reasons.join(', ')}`:''}\nCouverture de toute la salle : non mesurée. Précision physique : non certifiée.`;
 const rows=s.events.slice(-50).map(e=>{const tr=document.createElement('tr');for(const text of [e.name,e.status==='anchor'?'Origine':e.status==='accepted'?'Accepté':'Refusé',e.diagnostics?`score ${e.diagnostics.score.toFixed(3)} ; connus ${(100*e.diagnostics.coverage).toFixed(0)} % ; proches ${(100*e.diagnostics.hitFraction).toFixed(0)} %${e.reasons.length?' · '+e.reasons.join(', '):''}`:'Définition du repère, sans localisation préalable']){const td=document.createElement('td');td.textContent=text;tr.append(td);}return tr;});$('journal').replaceChildren(...rows);draw();liveStatus();
}
function draw(){
 const box=canvas.getBoundingClientRect(),w=Math.max(300,box.width),h=Math.max(250,box.height),dpr=devicePixelRatio||1;canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.fillStyle='#dce0e5';ctx.fillRect(0,0,w,h);
 const s=ui.session,g=s.grid;let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;
 for(let j=0;j<g.ny;j++)for(let i=0;i<g.nx;i++)if(g.cells[j*g.nx+i]!==127){xmin=Math.min(xmin,g.x+i*g.resolution);xmax=Math.max(xmax,g.x+(i+1)*g.resolution);ymin=Math.min(ymin,g.y+j*g.resolution);ymax=Math.max(ymax,g.y+(j+1)*g.resolution);}
 if(!Number.isFinite(xmin)){xmin=-5;xmax=5;ymin=-5;ymax=5;}
 const scale=Math.min((w-80)/(xmax-xmin+1),(h-80)/(ymax-ymin+1)),cx=(xmin+xmax)/2,cy=(ymin+ymax)/2;
 const screen=(x,y)=>[w/2+(x-cx)*scale,h/2-(y-cy)*scale];
 if($('view').value!=='points')for(let j=0;j<g.ny;j++)for(let i=0;i<g.nx;i++){const v=g.cells[j*g.nx+i];if(v===127)continue;ctx.fillStyle=v===0?'#fff':'#253747';const p=screen(g.x+i*g.resolution,g.y+(j+1)*g.resolution);ctx.fillRect(p[0],p[1],g.resolution*scale+.3,g.resolution*scale+.3);}
 if($('view').value!=='grid')for(let k=0;k<s.accepted.length;k++){const scan=s.accepted[k];ctx.fillStyle=C.color(k);for(const point of scan.points){if(Math.hypot(...point)>s.options.maxRange)continue;const p=screen(...C.transform(point,scan.pose));ctx.fillRect(p[0]-1,p[1]-1,2,2);}}
 function path(points,color,dashed=false){if(!points.length)return;ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=2;ctx.setLineDash(dashed?[5,4]:[]);points.forEach((p,i)=>{const q=screen(p.x,p.y);i?ctx.lineTo(...q):ctx.moveTo(...q);});ctx.stroke();ctx.setLineDash([]);}
 if(ui.truths)path(ui.truths.slice(0,ui.cursor),'#12825f',true);
 path(s.accepted.map(scan=>scan.pose),'#0755b8');
 for(const scan of s.accepted){const p=screen(scan.pose.x,scan.pose.y);ctx.fillStyle='#0755b8';ctx.beginPath();ctx.arc(...p,3,0,2*Math.PI);ctx.fill();}
 ctx.fillStyle='#17334d';ctx.font='12px system-ui';ctx.fillText(`X →   Y ↑ · mètres · grille ${g.resolution.toFixed(2)} m`,18,h-16);
}
function reset(){
 if(ui.busy||ui.playing)throw Error('Arrêter le rejeu avant de réinitialiser.');
 const session=new LidarSlam.Session({windowXY:value('windowXY'),windowTheta:value('windowTheta')});ui.version++;ui.session=session;ui.cursor=0;$('liveMapping').checked=false;refresh();
}
function loadExample(id){try{const ex=LIDAR_SLAM_EXAMPLES[id];reset();ui.scans=ex.scans.map(s=>JSON.parse(JSON.stringify(s)));ui.priors=ex.priors||null;ui.truths=ex.truths||null;$('priorMode').value=ui.priors?'provided':'previous';$('dataset').textContent=`${ui.scans.length} scans. ${ex.description}`;notice(ex.description);refresh();}catch(e){notice(e.message,true);}}
function prior(i){if($('priorMode').value==='provided'){if(!ui.priors?.[i])throw Error('Aucune pose assistée pour ce scan.');return ui.priors[i];}if($('priorMode').value==='manual')return{x:value('priorX'),y:value('priorY'),theta:value('priorTheta')};return null;}
async function integrate(scan,initial,version){
 ui.busy=true;refresh();
 try{
  const result=await ui.session.addAsync(scan,initial,p=>{$('notice').textContent=`Localisation sur la carte précédente : niveau ${p.level||'…'}, ${p.tested||0} poses testées…`;},()=>ui.version!==version);
  notice(result.status==='rejected'?`Scan refusé : ${result.reasons.join(', ')}. La carte est conservée.`:result.status==='anchor'?'Premier scan intégré : origine du repère.':'Pose acceptée puis carte mise à jour.',result.status==='rejected');return result;
 }finally{ui.busy=false;refresh();}
}
async function next(){if(ui.busy||ui.cursor>=ui.scans.length)return null;const i=ui.cursor,result=await integrate(ui.scans[i],prior(i),ui.version);ui.cursor++;refresh();return result;}
$('simulation').onclick=()=>loadExample('simulation');$('room').onclick=()=>loadExample('room');
$('reset').onclick=()=>{try{reset();notice('Carte vide. Le prochain scan définit son repère.');}catch(e){notice(e.message,true);}};
$('next').onclick=async()=>{try{await next();}catch(e){notice(e.message,true);refresh();}};
$('play').onclick=async()=>{if(ui.playing||ui.busy)return;ui.playing=true;const version=ui.version;refresh();try{while(ui.cursor<ui.scans.length&&version===ui.version){const result=await next();if(result?.status==='rejected'){notice('Rejeu suspendu après un refus. Contrôler la pose initiale ou poursuivre explicitement.',true);break;}await new Promise(r=>setTimeout(r,0));}}catch(e){notice(e.message,true);}finally{ui.playing=false;refresh();}};
$('cancel').onclick=()=>{ui.version++;ui.playing=false;$('liveMapping').checked=false;notice('Rejeu arrêté. Les scans déjà acceptés restent intégrés.');refresh();};
$('import').onclick=()=>$('files').click();
$('files').onchange=async e=>{try{if(ui.busy||ui.playing)throw Error('Attendre la fin du calcul.');const scans=[];for(const file of e.target.files)scans.push(C.parseScan(await file.text(),file.name));reset();ui.scans=scans;ui.priors=null;ui.truths=null;$('priorMode').value='previous';$('dataset').textContent=`${scans.length} CSV, dans l’ordre de sélection. Utiliser un parcours continu.`;refresh();}catch(e){notice(e.message,true);}e.target.value='';};
$('fit').onclick=draw;$('view').onchange=draw;new ResizeObserver(draw).observe(canvas);
$('save').onclick=()=>download('session_slam.json',ui.session.save());$('grid').onclick=()=>download('grille_slam.json',ui.session.grid.save());
$('png').onclick=()=>{const link=document.createElement('a');link.href=canvas.toDataURL('image/png');link.download='carte_slam.png';link.click();};
$('load').onclick=()=>$('sessionFile').click();$('sessionFile').onchange=async e=>{try{if(ui.busy||ui.playing)throw Error('Attendre la fin du calcul.');const session=LidarSlam.Session.load(await e.target.files[0].text());ui.version++;ui.session=session;ui.scans=[];ui.priors=null;ui.truths=null;ui.cursor=0;$('liveMapping').checked=false;notice('Session vérifiée et rechargée.');refresh();}catch(e){notice(e.message,true);}e.target.value='';};
async function received(frame){
 ui.received++;if(ui.rawSeen.has(frame.scan.checksum)){liveStatus();return;}
 if(ui.raw.length>=300){$('liveMapping').checked=false;ui.wifiRunning=false;ui.serialRunning=false;notice('300 captures conservées : exporter les données avant de poursuivre.',true);await ui.reader?.cancel();liveStatus();return;}
 ui.rawSeen.add(frame.scan.checksum);ui.raw.push({name:frame.scan.name,csv:frame.csv,span:frame.span,receivedAt:new Date().toISOString()});liveStatus();
 if(!$('liveMapping').checked)return;
 if(ui.busy||ui.playing){ui.skipped++;liveStatus();return;}
 try{const result=await integrate(frame.scan,null,ui.version);if(result.status==='rejected'){$('liveMapping').checked=false;liveStatus();notice('Cartographie en pause après un refus. Les captures continuent : vérifier la pose avant de reprendre.',true);}}
 catch(e){$('liveMapping').checked=false;notice(e.message,true);}
}
$('rawExport').onclick=()=>download('acquisitions_slam.json',JSON.stringify({format:'tp3-raw-scans-v1',scans:ui.raw,counters:{received:ui.received,invalid:ui.invalid,skippedDuringCalculation:ui.skipped}},null,2));
$('serial').onclick=async()=>{
 if(ui.serialRunning||ui.serialConnecting||ui.wifiRunning)return;
 let port=null,opened=false,reader=null;ui.serialConnecting=true;liveStatus();
 try{
  if(!navigator.serial||!isSecureContext)throw Error('Lecture USB indisponible ici : utiliser un navigateur compatible sur localhost ou HTTPS.');
  port=await navigator.serial.requestPort();await port.open({baudRate:115200,bufferSize:65536});opened=true;ui.port=port;ui.serialRunning=true;ui.serialConnecting=false;
  const decoder=new TextDecoder(),assembler=new LidarSlamAcquisition.Assembler(frame=>{void received(frame);},error=>{ui.invalid++;liveStatus();notice(error,true);});
  reader=port.readable.getReader();ui.reader=reader;liveStatus();notice('Lecture lidar USB active. Cocher la cartographie quand le capteur est prêt.');
  while(ui.serialRunning){const{value,done}=await reader.read();if(done)break;if(value)assembler.feed(decoder.decode(value,{stream:true}));}
 }catch(e){notice(e.message,true);}
 finally{
  if(reader)reader.releaseLock();ui.reader=null;
  if(opened)try{await port.close();}catch(e){notice(`Fermeture du port : ${e.message}`,true);}
  ui.port=null;ui.serialRunning=false;ui.serialConnecting=false;liveStatus();
 }
};
$('disconnect').onclick=async()=>{ui.serialRunning=false;$('liveMapping').checked=false;ui.version++;if(ui.reader)await ui.reader.cancel();liveStatus();};
$('wifi').onclick=async()=>{
 if(ui.serialRunning||ui.serialConnecting||ui.wifiRunning)return;
 try{
  const base=new URL($('robotURL').value);if(!['http:','https:'].includes(base.protocol)||base.username||base.password||base.search||base.hash)throw Error('Adresse robot invalide.');
  ui.wifiRunning=true;liveStatus();let counter=0;
  while(ui.wifiRunning){
   const abort=new AbortController();ui.wifiAbort=abort;const timer=setTimeout(()=>abort.abort(),2000);
   try{const response=await fetch(new URL('/scan',base),{signal:abort.signal,cache:'no-store'});if(!response.ok)throw Error(`Robot : réponse ${response.status}`);const bytes=await response.arrayBuffer();if(!ui.wifiRunning)break;const frame=LidarSlamAcquisition.binary(bytes,`scan_wifi_${Date.now()}_${++counter}.csv`);void received(frame);}
   finally{clearTimeout(timer);ui.wifiAbort=null;}
   await new Promise(r=>setTimeout(r,250));
  }
 }catch(e){if(ui.wifiRunning)notice(`Lecture Wi-Fi arrêtée : ${e.message}. Vérifier le réseau et le firmware RobotControl.`,true);}
 finally{ui.wifiRunning=false;liveStatus();}
};
$('stopWifi').onclick=()=>{ui.wifiRunning=false;ui.wifiAbort?.abort();$('liveMapping').checked=false;ui.version++;liveStatus();};
refresh();
