const assert=require('node:assert/strict'),C=require('../visualisation/core.js'),L=require('../visualisation/grid-localisation.js');
const {Session}=require('./session.js'),A=require('./acquisition.js'),{scene}=require('../localisation/grid/scene.cjs');
const s=scene(),scan=(p,i)=>({...s.scan(p,180,.004,900+i),name:`test_${i}.csv`});
const p0={x:-2,y:-2,theta:0},first=scan(p0,0),second=scan({x:-1.8,y:-2,theta:1},1);
async function main(){
 const session=new Session(),untouched=JSON.stringify(first);const anchor=session.add(first);
 assert.equal(anchor.status,'anchor');assert.deepEqual(session.lastPose,{x:0,y:0,theta:0});assert.equal(JSON.stringify(first),untouched);
 const original=L.match;let beforeSearch;
 L.match=(map,input,initial,options)=>{beforeSearch=map.save();assert.equal(map.scans.some(s=>s.checksum===input.checksum),false);assert.deepEqual(initial,{x:0,y:0,theta:0});return original(map,input,initial,options);};
 const result=session.add({...second,pose:{x:100,y:100,theta:100}});L.match=original;
 assert.equal(result.status,'accepted');assert.ok(Math.hypot(result.pose.x-.2,result.pose.y)<.2);assert.ok(Math.abs(result.pose.theta-1)<2);
 assert.equal(JSON.parse(beforeSearch).scans.length,1);assert.equal(session.grid.scans.length,2);
 const before=session.grid.save(),last=JSON.stringify(session.lastPose),count=session.accepted.length;
 assert.throws(()=>session.add({...second,name:'renamed.csv'}),/déjà/);assert.equal(session.grid.save(),before);
 assert.throws(()=>session.add({...second,points:[[NaN,0]]}),/invalide/);assert.equal(session.grid.save(),before);
 // Translation far outside the local window; all source points are still finite.
 const unrelated={name:'unrelated.csv',points:Array.from({length:180},(_,i)=>[.2*Math.cos(i*Math.PI/90),.2*Math.sin(i*Math.PI/90)]),pose:{x:0,y:0,theta:0}};
 const rejected=session.add(unrelated);assert.equal(rejected.status,'rejected');assert.equal(session.grid.save(),before);assert.equal(JSON.stringify(session.lastPose),last);assert.equal(session.accepted.length,count);
 const third=scan({x:-1.6,y:-2,theta:2},2),events=session.events.length;let cancelled=false;
 await assert.rejects(session.addAsync(third,null,()=>{cancelled=true;},()=>cancelled),/annul/);assert.equal(session.grid.save(),before);assert.equal(session.events.length,events);assert.equal(session.busy,false);
 const pending=session.addAsync(third);assert.throws(()=>session.add(scan(p0,3)),/cours/);await pending;
 const saved=session.save(),loaded=Session.load(saved);assert.equal(loaded.grid.save(),session.grid.save());assert.deepEqual(loaded.lastPose,session.lastPose);
 const damaged=JSON.parse(saved);damaged.grid.cells[0]=damaged.grid.cells[0]===0?127:0;assert.throws(()=>Session.load(JSON.stringify(damaged)),/incohérente/);
 console.log('OK SLAM : localisation avant insertion, pose précédente, pose embarquée ignorée, refus atomique, doublons, annulation, concurrence et restauration vérifiée.');
 const packet=new Uint8Array(8+360*5),d=new DataView(packet.buffer);d.setInt16(0,-1234,true);d.setInt16(2,2345,true);d.setUint16(4,12300,true);d.setUint16(6,360,true);
 for(let i=0;i<360;i++){d.setUint16(8+5*i,i*100,true);d.setUint16(10+5*i,2000,true);d.setUint8(12+5*i,200);}
 const frame=A.binary(packet);assert.equal(frame.scan.points.length,360);assert.equal(frame.reportedPose.xMm,-1234);assert.deepEqual(frame.scan.pose,{x:0,y:0,theta:0});assert.ok(frame.scan.points[90][1]<0);
 assert.throws(()=>A.binary(packet.slice(0,-1)),/Taille/);const tooMany=packet.slice();new DataView(tooMany.buffer).setUint16(6,500,true);assert.throws(()=>A.binary(tooMany),/Taille/);
 let frames=[],errors=[];const a=new A.Assembler(f=>frames.push(f),e=>errors.push(e)),rows=frame.csv.split('\n').slice(1),stream=rows.join('\r\n')+'\r\n\r\n';
 for(let i=0;i<stream.length;i+=17)a.feed(stream.slice(i,i+17));assert.equal(frames.length,1);assert.equal(frames[0].scan.points.length,360);assert.equal(errors.length,0);
 const missing=rows.filter((_,i)=>i!==40).join('\n')+'\n\n';a.feed(missing);assert.equal(frames.length,1);assert.equal(errors.length,1);
 a.feed(rows.join('\n')+'\n0,0,2000,200\n');assert.equal(frames.length,2);
 assert.throws(()=>A.checkAngles(Array.from({length:720},(_,i)=>i%360)),/plusieurs/);
 console.log('OK acquisition : binaire exact, poses non odométriques ignorées, sens des angles, trames tronquées, flux fragmenté, indices manquants et multi-tours.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
