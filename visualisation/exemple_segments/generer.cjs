// Depuis la racine : node visualisation/exemple_segments/generer.cjs
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const S=require('../segments.js'),C=require('../core.js');
const root=path.resolve(__dirname,'../..'),name='scan_20261103_113903_422823.csv';
const scan=C.parseScan(fs.readFileSync(path.join(root,name),'utf8'),name);
const parameters={gap:.30,residual:.05,minPoints:5,minLength:.15};
const lines=S.extract(scan.points,parameters),source={name,checksum:scan.checksum,pose:{x:0,y:0,theta:0}};
const items=lines.map((line,i)=>({label:`L${i+1}`,color:'#8c3f9b',segment:S.segment(line.a,line.b),sources:[source]}));
fs.writeFileSync(path.join(__dirname,'segments_scan_reel.json'),S.save(items));
fs.writeFileSync(path.join(__dirname,'segments_scan_reel.csv'),S.csv(items));
const a=S.segment([0,0],[4,0]),b=S.segment([1,-1],[1,1]);
const before=[{label:'A',color:'#d94b35',segment:a,sources:[]},{label:'B',color:'#226dc2',segment:b,sources:[]}];
const cut=S.cutLongest(a,b);assert.equal(cut.changed,true);assert.equal(S.length(cut.segment),3);
const after=[{...before[0],segment:cut.segment},before[1]];
fs.writeFileSync(path.join(__dirname,'decoupage_avant.json'),S.save(before));
fs.writeFileSync(path.join(__dirname,'decoupage_apres.json'),S.save(after));
const cases=[
 ['interieur_plus_long',a,b],
 ['egalite_exacte',a,S.segment([2,-1],[2,1])],
 ['egalite_tolerance',a,S.segment([2-S.EPS/4,-1],[2-S.EPS/4,1])],
 ['sens_inverse_egalite',S.segment([4,0],[0,0]),S.segment([2,-1],[2,1])],
 ['extremite_A',a,S.segment([4,-1],[4,1])],
 ['proche_extremite_A',a,S.segment([S.EPS/2,-1],[S.EPS/2,1])],
 ['croisement_hors_B',a,S.segment([1,1],[1,2])],
 ['croisement_hors_A',a,S.segment([5,-1],[5,1])],
 ['colineaires',a,S.segment([1,0],[3,0])],
 ['extremite_B_dans_A',a,S.segment([1,0],[1,1])]
].map(([name,a,b])=>({name,a,b,intersection:S.intersection(a,b),cut:S.cutLongest(a,b)}));
fs.writeFileSync(path.join(__dirname,'cas_limites.json'),JSON.stringify({linearToleranceM:S.EPS,parallelSinTolerance:S.ANGLE_EPS,cases},null,2));
const m1=S.segment([0,0],[2,0]),m2=S.segment([2.05,.04],[4,.04]);
const proximity=S.proximity(m1,m2),merged=S.merge(m1,m2);
const report={source:name,pose:source.pose,realPoints:scan.points.length,extractedSegments:lines.length,parameters,
 angularConvention:'Support angle 0..90 degrees, endpoint-direction angle 0..180 degrees',linearToleranceM:S.EPS,parallelSinTolerance:S.ANGLE_EPS,
 exampleCut:{a,b,result:cut},exampleMerge:{a:m1,b:m2,proximity,merged},
 limitations:'Approximate piecewise linear extraction; not a complete vector map. Synthetic cut/merge examples are distinct from real measurements.'};
fs.writeFileSync(path.join(__dirname,'bilan.json'),JSON.stringify(report,null,2));
const imageData={report,points:scan.points,lines:items.map(i=>i.segment),before:before.map(i=>i.segment),after:after.map(i=>i.segment)};
// Optional plot data goes to an explicitly chosen path; no effect on source scans.
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(imageData));
assert.equal(S.load(fs.readFileSync(path.join(__dirname,'segments_scan_reel.json'),'utf8')).length,lines.length);
console.log(`${scan.points.length} real points -> ${lines.length} segments. Cut: 4 m -> 3 m, cutter unchanged. All JSON exports reload.`);
