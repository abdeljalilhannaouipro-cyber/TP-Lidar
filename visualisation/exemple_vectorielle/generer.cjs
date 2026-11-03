// Depuis la racine : node visualisation/exemple_vectorielle/generer.cjs
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const C=require('../core.js'),S=require('../segments.js'),{VectorMap}=require('../vector-map.js');
const root=path.resolve(__dirname,'../..'),meta=JSON.parse(fs.readFileSync(path.join(__dirname,'../exemple_mise_a_jour/poses_et_qualite.json'),'utf8'));
const a=C.parseScan(fs.readFileSync(path.join(root,'controle_scans',meta.reference),'utf8'),meta.reference);
const b=C.parseScan(fs.readFileSync(path.join(root,meta.moving),'utf8'),meta.moving);b.pose={...meta.pose};
const first=new VectorMap(),firstReport=first.integrate(a);
fs.writeFileSync(path.join(__dirname,'carte_avant.json'),first.save());
fs.writeFileSync(path.join(__dirname,'carte_avant.csv'),first.csv());
const map=VectorMap.load(first.save()),secondReport=map.integrate(b);
fs.writeFileSync(path.join(__dirname,'carte_vectorielle.json'),map.save());
fs.writeFileSync(path.join(__dirname,'carte_vectorielle.csv'),map.csv());
fs.writeFileSync(path.join(__dirname,'poses_scans.json'),C.savePoses([a,b]));
const roundtrip=VectorMap.load(map.save());assert.deepEqual(roundtrip.features,map.features);assert.equal(roundtrip.integrate(b).duplicate,true);
const clean=new VectorMap();clean.seed([S.segment([2,-2],[2,2])]);
const cleaning=[{step:0,map:JSON.parse(clean.save())}];
for(let i=0;i<3;i++){const feature=clean.features[0],mid=(feature.segment.a[1]+feature.segment.b[1])/2,points=[[4,2*mid-.2],[4,2*mid],[4,2*mid+.2]];const scan={name:`synthetic_free_${i+1}`,checksum:C.checksum(points),points,pose:{x:0,y:0,theta:0},qualities:[220,220,220]};const report=clean.integrate(scan);cleaning.push({step:i+1,points,report,map:JSON.parse(clean.save())});}
assert.equal(clean.features.length,0);
fs.writeFileSync(path.join(__dirname,'exemple_nettoyage_synthetique.json'),JSON.stringify({description:'Synthetic old vertical segment crossed by three distinct rays per scan; not real measurements.',snapshots:cleaning},null,2));
const report={reference:a.name,moving:b.name,poses:[a.pose,b.pose],poseEstimation:meta,options:map.options,first:firstReport,second:secondReport,stats:map.stats(),
 note:'Two real scans in a local reference frame; not a complete six-scan room map. Second pose estimated, not measured. No contradiction was detected on this real pair; cleanup demonstrated separately using synthetic rays.'};
fs.writeFileSync(path.join(__dirname,'bilan.json'),JSON.stringify(report,null,2));
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify({report,clouds:[a,b].map(s=>s.points.map(p=>C.transform(p,s.pose))),before:first.features,after:map.features,poses:[a.pose,b.pose]}));
console.log(JSON.stringify(report.stats));console.log('Before:',first.features.length,'After:',map.features.length,'Confirmed:',map.stats().confirmed,'Merge operations:',secondReport.merges);
