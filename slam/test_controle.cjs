// Tests hors matériel : aucun accès réseau réel, aucune commande au robot.
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
function setup(){
 const node=()=>({value:'',classList:{toggle(){}},focus(){this.focused=true;},setPointerCapture(){}});
 const nodes=Object.fromEntries(['address','status','connect','speed','speedValue','keyboard','stop','scan','range','lidarStatus','motorStatus'].map(id=>[id,node()]));
 nodes.range.value='6';nodes.scan.width=600;nodes.scan.getContext=()=>new Proxy({}, {get:(o,k)=>()=>{}});
 nodes.address.value='http://192.168.4.1';nodes.speed.value='80';
 const moves=['forward','backward','left','right','rotateleft','rotateright'].map(move=>({...node(),dataset:{move}}));
 const calls=[],events={},windows={};let interval,respond=null;
 const sandbox={console,encodeURIComponent,AbortSignal,DataView,Math,Date,location:{hostname:'127.0.0.1',origin:'http://127.0.0.1'},
 document:{getElementById:id=>nodes[id],querySelectorAll:()=>moves,addEventListener:(n,f)=>events[n]=f},window:{addEventListener:(n,f)=>windows[n]=f},setInterval:(f,ms)=>{if(ms===120)interval=f;},
 fetch:async url=>{const u=new URL(url);calls.push(u);if(respond)return respond(u);if(u.pathname==='/scan')return {ok:false,json:async()=>({error:'Pas de scan recent'})};return {ok:true,json:async()=>u.pathname==='/api/connect'?{firmware:'Robot_Lidar_v3',motorAck:true,token:'session1'}:{ok:true}};}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/controle.js','utf8'),sandbox);
 return {decode:sandbox.decodeScan,nodes,moves,calls,events,windows,tick:()=>interval(),response:f=>respond=f};
}
const flush=()=>new Promise(r=>setImmediate(r));
const event=(key,extra={})=>({key,repeat:false,target:{tagName:'BODY'},preventDefault(){},...extra});
const pointer=(id=1)=>({button:0,pointerId:id,preventDefault(){}});
(async()=>{
 const s=setup();
 const packet=new ArrayBuffer(508), dv=new DataView(packet);dv.setUint16(6,100,true);for(let i=0;i<100;i++){dv.setUint16(8+5*i,9000,true);dv.setUint16(10+5*i,2000,true);}
 const cloud=s.decode(packet);assert.equal(cloud.length,100);assert.ok(Math.abs(cloud[0].x)<1e-10);assert.equal(cloud[0].y,2);
 assert.throws(()=>s.decode(new ArrayBuffer(9)),/Taille/);dv.setUint16(8,36000,true);assert.throws(()=>s.decode(packet),/Angle/);dv.setUint16(8,0,true);dv.setUint16(10,0,true);assert.equal(s.decode(packet).length,99);
 assert.equal(s.calls.length,0);assert.ok(s.moves.every(b=>b.disabled));
 s.events.keydown(event('ArrowUp'));assert.equal(s.calls.length,0);
 await s.nodes.connect.onclick();assert.ok(s.moves.every(b=>!b.disabled));assert.ok(s.nodes.keyboard.focused);
 for(const [key,action] of [['ArrowUp','forward'],['ArrowDown','backward'],['ArrowLeft','left'],['ArrowRight','right'],['q','rotateleft'],['E','rotateright']]){
   s.events.keydown(event(key));await flush();assert.equal(s.calls.filter(c=>c.pathname==='/api/command').at(-1).searchParams.get('action'),action);
   const n=s.calls.length;s.events.keydown(event(key,{repeat:true}));assert.equal(s.calls.length,n);
   await s.tick();assert.equal(s.calls.filter(c=>c.pathname==='/api/command').at(-1).searchParams.get('action'),action);
   s.events.keyup(event(key));await flush();assert.equal(s.calls.at(-1).searchParams.get('action'),'stop');
   const count=s.calls.length;await s.tick();assert.equal(s.calls.length,count);
 }
 const n=s.calls.length;s.events.keydown(event('ArrowUp',{target:{tagName:'INPUT'}}));s.events.keydown(event('ArrowUp',{ctrlKey:true}));assert.equal(s.calls.length,n);
 for(const b of s.moves){b.onpointerdown(pointer());await flush();assert.equal(s.calls.at(-1).searchParams.get('action'),b.dataset.move);b.onpointerup(pointer());await flush();assert.equal(s.calls.at(-1).searchParams.get('action'),'stop');}
 s.events.keydown(event('ArrowUp'));await flush();s.events.keydown(event(' '));await flush();assert.equal(s.calls.at(-1).searchParams.get('action'),'stop');
 s.events.keydown(event('ArrowUp'));await flush();s.windows.blur();await flush();assert.equal(s.calls.at(-1).searchParams.get('action'),'stop');
 const sequences=s.calls.filter(c=>c.pathname==='/api/command').map(c=>Number(c.searchParams.get('seq')));assert.ok(sequences.every((n,i)=>i===0||n>sequences[i-1]));
 // Un STOP n'attend pas la réponse d'un mouvement. Un ACK tardif ne relance rien.
 let resolve;s.response(u=>u.searchParams.get('action')==='forward'?new Promise(r=>resolve=r):Promise.resolve({ok:true,json:async()=>({ok:true})}));
 s.events.keydown(event('ArrowUp'));s.events.keyup(event('ArrowUp'));await flush();assert.equal(s.calls.at(-1).searchParams.get('action'),'stop');
 resolve({ok:true,json:async()=>({ok:true})});await flush();const count=s.calls.length;await s.tick();assert.equal(s.calls.length,count);
 // Carte absente ou ancienne version : commandes verrouillées.
 const absent=setup();absent.response(u=>Promise.resolve(u.pathname==='/scan'?{ok:false,json:async()=>({error:'Pas de scan'})}:{ok:true,json:async()=>({firmware:'Robot_Lidar_v3',motorAck:false,token:''})}));await absent.nodes.connect.onclick();assert.ok(absent.moves.every(b=>b.disabled));assert.match(absent.nodes.motorStatus.textContent,/Carte moteur absente/);assert.ok(absent.calls.some(u=>u.pathname==='/scan'));
 const bad=setup();bad.response(()=>Promise.resolve({ok:false,json:async()=>({error:'Carte moteur absente'})}));await bad.nodes.connect.onclick();assert.ok(bad.moves.every(b=>b.disabled));assert.match(bad.nodes.status.textContent,/Carte moteur absente/);
 // Perte réseau : arrêt demandé et reconnexion nécessaire.
 s.response(()=>Promise.reject(new Error('réseau perdu')));s.events.keydown(event('ArrowUp'));await flush();assert.ok(s.moves.every(b=>b.disabled));
 console.log('PASS : six directions clavier/boutons, maintien, relâchement, heartbeat, STOP prioritaire, ACK tardif, séquences, perte de focus/réseau, carte absente, décodage scan métrique et paquets invalides.');
})().catch(e=>{console.error(e);process.exitCode=1;});
