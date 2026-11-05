const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Session}=require('../session.js');
const base=__dirname;
class Element{constructor(){this.value='';this.checked=false;this.disabled=false;this.children=[];this.classList={toggle(){}};this.dataset={};this.tagName='DIV';this.style={};}addEventListener(n,f){this["on"+n]=f;}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v.flatMap(e=>e.fragment?e.children:[e]);}focus(){}click(){return this.onclick?.();}setPointerCapture(){}getBoundingClientRect(){return{width:700,height:510};}getContext(){return new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)})},{get:(o,k)=>o[k]||(()=>{})});}toDataURL(){return'data:image/png;base64,';}}
const ids={};for(const id of ['rawCount','source','acceptedCount','rejections','position','heading','importSession','exportSession','view','fit','map','mapBadge','mapTitle','message','connection','address','connect','armed','pad','stop','commandStatus','usb','wifi','disconnect','mapping','liveStatus','newMap','rawExport','png','importRaw','selectedCount','scanList','journal','sessionFile','rawFiles'])ids[id]=new Element();
ids.address.value='http://192.168.4.1';ids.view.value='both';
const actions=['rotateleft','forward','rotateright','left','right','strafeleft','backward','straferight'].map(action=>{const b=new Element();b.dataset.action=action;return b;});
const calls=[],events={},windows={},timers=new Map();let responseOverride=null;
class FakeWorker{constructor(){this.s=new Session();}postMessage(m){Promise.resolve().then(async()=>{try{let result;if(m.type==='load'){this.s=Session.load(m.text);result=this.snap();}else if(m.type==='save')result=this.s.save();else if(m.type==='reset'){this.s=new Session();result=this.snap();}else if(m.type==='add'){const event=this.s.add(m.scan);result={event,snapshot:this.snap()};}this.onmessage({data:{id:m.id,result}});}catch(e){this.onmessage({data:{id:m.id,error:e.message}});}});}snap(){return{grid:JSON.parse(this.s.grid.save()),scans:this.s.accepted,events:this.s.events,lastPose:this.s.lastPose};}}
const C=require('../../visualisation/core.js'),A=require('../acquisition.js');
const context={console,Map,Set,Date,Math,DataView,Uint8ClampedArray,LidarCore:C,LidarSlamAcquisition:A,Worker:FakeWorker,ResizeObserver:class{observe(){}},isSecureContext:true,navigator:{},Blob,AbortSignal,URL,confirm:()=>false,setTimeout,clearTimeout,setInterval:(f,ms)=>timers.set(ms,f),window:{devicePixelRatio:1,addEventListener:(n,f)=>windows[n]=f},document:{hidden:false,getElementById:id=>ids[id],querySelectorAll:()=>actions,createElement:()=>new Element(),createDocumentFragment:()=>{const e=new Element();e.fragment=true;return e;},addEventListener:(n,f)=>events[n]=f},fetch:async url=>{calls.push(String(url));if(String(url).startsWith('data/')){const t=fs.readFileSync(path.join(base,url),'utf8');return{ok:true,text:async()=>t,json:async()=>JSON.parse(t)};}if(responseOverride)return responseOverride(String(url));return{ok:true,text:async()=>String(url).includes('/interface_version')?'tp3-cockpit-v1':String(url).includes('/stop')?'STOP':'OK'};}};
vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(base,'cockpit.js'),'utf8'),context);
const run=code=>vm.runInContext(code,context),flush=()=>new Promise(r=>setImmediate(r));
const key=(k,extra={})=>({key:k,repeat:false,target:{tagName:'BODY'},preventDefault(){},...extra});
(async()=>{for(let i=0;i<8;i++)await flush();assert.equal(ids.rawCount.textContent,300);assert.equal(ids.acceptedCount.textContent,70);assert.equal(calls.filter(c=>c.startsWith('http')).length,0);assert.ok(actions.every(b=>b.disabled));assert.equal(ids.scanList.children.length,300);
 const pose=JSON.stringify(run('state.snap.lastPose'));ids.scanList.children[70].onclick();assert.equal(ids.view.value,'raw');assert.match(ids.mapBadge.textContent,/POSE GLOBALE INCONNUE/);assert.equal(JSON.stringify(run('state.snap.lastPose')),pose);
 await ids.connect.onclick();assert.equal(run('state.connected'),true);assert.ok(actions.every(b=>b.disabled));ids.armed.checked=true;ids.armed.onchange();assert.ok(actions.every(b=>!b.disabled));
 for(const [k,a] of [['ArrowUp','forward'],['ArrowDown','backward'],['ArrowLeft','left'],['ArrowRight','right'],['q','strafeleft'],['E','straferight'],['a','rotateleft'],['d','rotateright']]){events.keydown(key(k));await flush();assert.match(calls.at(-1),new RegExp('/'+a+'\\?seq='));const n=calls.length;events.keydown(key(k,{repeat:true}));assert.equal(calls.length,n);events.keyup(key(k));await flush();assert.match(calls.at(-1),/\/stop\?seq=/);}
 const n=calls.length;events.keydown(key('ArrowUp',{target:{tagName:'INPUT'}}));assert.equal(calls.length,n);
 for(const b of actions){b.onpointerdown({button:0,pointerId:1,preventDefault(){}});await flush();assert.ok(calls.at(-1).includes('/'+b.dataset.action+'?'));b.onpointerup({pointerId:1});await flush();}
 events.keydown(key('ArrowUp'));await flush();events.keydown(key('Escape'));await flush();assert.equal(run('state.active'),null);assert.match(calls.at(-1),/\/stop/);
 events.keydown(key('ArrowUp'));await flush();windows.blur();await flush();assert.equal(ids.armed.checked,false);assert.equal(run('state.active'),null);
 const seq=calls.filter(c=>c.includes('?seq=')).map(c=>Number(new URL(c).searchParams.get('seq')));assert.ok(seq.every((v,i)=>i===0||v>seq[i-1]));
 // STOP doit être envoyé avant la réponse d'une requête de mouvement en attente.
 ids.armed.checked=true;ids.armed.onchange();let resolve;responseOverride=url=>url.includes('/forward')?new Promise(r=>resolve=r):Promise.resolve({ok:true,text:async()=>'STOP'});
 events.keydown(key('ArrowUp'));events.keyup(key('ArrowUp'));await flush();assert.match(calls.at(-1),/\/stop/);resolve({ok:true,text:async()=>'OK'});await flush();assert.equal(run('state.active'),null);
 // Un appui suivant attend la confirmation du STOP précédent.
 let finishStop;responseOverride=url=>url.includes('/stop')?new Promise(r=>finishStop=r):Promise.resolve({ok:true,text:async()=>'OK'});
 const stopping=run('stop()');await flush();const beforeRestart=calls.length;
 events.keydown(key('ArrowDown'));await flush();assert.equal(calls.length,beforeRestart);assert.equal(run('state.stopping'),1);assert.ok(actions.every(b=>b.disabled));
 finishStop({ok:true,text:async()=>'STOP'});await stopping;assert.equal(run('state.stopping'),0);
 // Une erreur HTTP de commande ne doit pas prétendre à une perte Wi-Fi.
 responseOverride=url=>Promise.resolve(url.includes('/forward')?{ok:false,status:409,text:async()=>'OLD_COMMAND'}:{ok:true,text:async()=>'STOP'});
 ids.armed.checked=true;ids.armed.onchange();events.keydown(key('ArrowUp'));await flush();await flush();assert.equal(run('state.connected'),true);assert.equal(ids.armed.checked,false);assert.equal(run('state.active'),null);assert.match(ids.commandStatus.textContent,/HTTP 409/);assert.match(ids.commandStatus.textContent,/toujours connecté/);
 // Même un STOP refusé par HTTP prouve une réponse du robot ; mouvement désactivé.
 responseOverride=()=>Promise.resolve({ok:false,status:409,text:async()=>'OLD_COMMAND'});await run('stop()');assert.equal(run('state.connected'),true);assert.equal(ids.armed.checked,false);assert.match(ids.commandStatus.textContent,/STOP non confirmé/);
 // Absence réelle de réponse à STOP et au ping : reconnecter est nécessaire.
 responseOverride=()=>Promise.reject(new Error('Failed to fetch'));await run('stop()');assert.equal(run('state.connected'),false);assert.equal(ids.armed.checked,false);
 responseOverride=()=>Promise.resolve({ok:false,status:404,text:async()=>'NOT_FOUND'});run('state.connected=false');await ids.connect.onclick();assert.equal(run('state.connected'),false);assert.ok(actions.every(b=>b.disabled));
 ids.mapping.checked=true;ids.mapping.onchange();assert.equal(ids.mapping.checked,false);assert.equal(run('state.snap.scans.length'),70);
 console.log('PASS cockpit : 300 captures réelles, 70 poses conservées, scan isolé non localisé, aucun ordre au chargement, activation explicite, 8 commandes clavier/boutons, STOP prioritaire, séquences, focus, firmware incompatible, STOP en attente, HTTP 409 sans fausse déconnexion et panne réseau confirmée.');
})().catch(e=>{console.error(e);process.exitCode=1;});
