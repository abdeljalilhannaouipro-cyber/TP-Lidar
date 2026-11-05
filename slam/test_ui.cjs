// Gestionnaires réels dans un DOM minimal, sans validation graphique ni matériel.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const base=__dirname,ids={},context={};
for(const method of ['setTransform','clearRect','fillRect','fillText','beginPath','moveTo','lineTo','stroke','setLineDash','arc','fill'])context[method]=()=>{};
class Element{
 constructor(){this.value='';this.checked=false;this.children=[];this.style={};this.classList={toggle(){}};this.textContent='';}
 append(x){this.children.push(x);}replaceChildren(...x){this.children=x;}click(){return this.onclick?.();}getContext(){return context;}getBoundingClientRect(){return{width:900,height:560};}toDataURL(){return'data:image/png;base64,';}
}
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
for(const m of html.matchAll(/<(\w+)[^>]*\bid="([^"]+)"[^>]*>/g)){const e=new Element(),v=/value="([^"]*)"/.exec(m[0]);if(v)e.value=v[1];ids[m[2]]=e;}
ids.view.value='both';ids.priorMode.value='previous';
const sandbox={console,performance,setTimeout,clearTimeout,Blob,URL,TextDecoder,AbortController,Uint8Array,DataView,ResizeObserver:class{observe(){}},devicePixelRatio:1,isSecureContext:true,
 navigator:{},document:{getElementById:id=>{assert.ok(ids[id],id);return ids[id];},createElement:()=>new Element()}};
sandbox.window=sandbox;vm.createContext(sandbox);
for(const file of ['../visualisation/core.js','../visualisation/grid.js','../visualisation/grid-localisation.js','session.js','acquisition.js','exemples.js','app.js'])vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),sandbox,{filename:file});
const run=text=>vm.runInContext(text,sandbox);
async function main(){
 ids.simulation.click();assert.equal(run('slamApp.scans.length'),33);assert.equal(ids.priorMode.value,'previous');
 await ids.next.click();assert.equal(run('slamApp.session.accepted.length'),1);assert.equal(run('slamApp.cursor'),1);
 await ids.next.click();assert.equal(run('slamApp.session.accepted.length'),2);assert.ok(ids.stats.textContent.includes('2 scan(s)'));
 const before=run('slamApp.session.grid.save()');const pending=ids.next.click();ids.cancel.click();await pending;assert.equal(run('slamApp.session.grid.save()'),before);assert.equal(run('slamApp.cursor'),2);assert.equal(run('slamApp.busy'),false);
 ids.priorMode.value='manual';ids.priorX.value='';await ids.next.click();assert.equal(run('slamApp.cursor'),2);assert.equal(run('slamApp.session.grid.save()'),before);
 const saved=run('slamApp.session.save()');ids.reset.click();assert.equal(run('slamApp.session.accepted.length'),0);
 ids.sessionFile.files=[{text:async()=>saved}];await ids.sessionFile.onchange({target:ids.sessionFile});assert.equal(run('slamApp.session.accepted.length'),2);
 ids.files.files=[{name:'invalid.csv',text:async()=>'<html>bad</html>'}];await ids.files.onchange({target:ids.files});assert.equal(run('slamApp.session.accepted.length'),2);
 ids.room.click();assert.equal(run('slamApp.scans.length'),7);assert.equal(ids.priorMode.value,'provided');assert.ok(ids.dataset.textContent.includes('aidées')||ids.dataset.textContent.includes('assisté'));
 // The connection must remain user initiated. No network/serial calls during page setup.
 let requested=0,opened=0,closed=0,read=0;run('slamApp.raw=[];slamApp.rawSeen.clear();');
 const csv=fs.readFileSync(path.resolve(base,'../localisation/entre_scans/campagne_mesuree/A/scan_20261103_180804_809310.csv'),'utf8').split(/\r?\n/).slice(1).filter(Boolean).join('\n')+'\n\n';
 const reader={read:async()=>++read===1?{done:false,value:new TextEncoder().encode(csv)}:{done:true},releaseLock(){},cancel:async()=>{}};
 sandbox.navigator.serial={requestPort:async()=>{requested++;return{open:async options=>{assert.equal(options.baudRate,115200);opened++;},close:async()=>{closed++;},readable:{getReader:()=>reader}};}};
 await ids.serial.click();assert.equal(requested,1);assert.equal(opened,1);assert.equal(closed,1);assert.equal(run('slamApp.raw.length'),1);assert.equal(run('slamApp.session.accepted.length'),0);
 console.log('UI SLAM OK : simulation, intégration, annulation atomique, import conservateur, poses assistées identifiées, USB en lecture seule sur faux port. Rendu et robot non testés.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
