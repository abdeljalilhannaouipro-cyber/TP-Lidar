// Depuis la racine : node traitement_complet/recalculer.cjs
// Consomme les poses retenues par alignement.py, sans modifier les sources.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const C=require('../visualisation/core.js'),S=require('../visualisation/segments.js'),{Grid}=require('../visualisation/grid.js'),{VectorMap}=require('../visualisation/vector-map.js');
const root=path.resolve(__dirname,'..'),folder=path.resolve(__dirname,process.argv[2]||'resultats');
const alignment=JSON.parse(fs.readFileSync(path.join(folder,'alignement.json'),'utf8'));
const sources=alignment.inputs.map(record=>{
 const scan=C.parseScan(fs.readFileSync(path.join(root,record.path),'utf8'),record.name);
 assert.equal(scan.points.length,record.valid_points);return scan;
});
function buildSet(name,records,description){
 const destination=path.join(folder,name);fs.mkdirSync(destination,{recursive:true});
 const selected=new Set(records.map(r=>r.index));
 const posed=sources.map((s,i)=>({...s,pose:{x:0,y:0,theta:0},visible:selected.has(i)}));
 for(const record of records)posed[record.index].pose={...record.pose};
 fs.writeFileSync(path.join(destination,'poses.json'),C.savePoses(posed));
 const active=records.map(r=>posed[r.index]);
 let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;
 const cloud=[];
 for(const scan of active){
  for(let i=0;i<scan.points.length;i++){
   const p=C.transform(scan.points[i],scan.pose);cloud.push({source:scan.name,x:p[0],y:p[1]});
   xmin=Math.min(xmin,p[0],scan.pose.x);xmax=Math.max(xmax,p[0],scan.pose.x);ymin=Math.min(ymin,p[1],scan.pose.y);ymax=Math.max(ymax,p[1],scan.pose.y);
  }
 }
 // Keep unfiltered points in the merged export; maps use their configured range filter.
 fs.writeFileSync(path.join(destination,'points_alignés.csv'),C.exportPoints(active));
 const resolution=.10,x=Math.floor(xmin)-1,y=Math.floor(ymin)-1,width=Math.ceil(xmax)-x+1,height=Math.ceil(ymax)-y+1;
 const grid=new Grid({resolution,x,y,width,height}),vector=new VectorMap();let segments=[];
 const gridReports=[],vectorReports=[];
 for(const scan of active){
  gridReports.push({name:scan.name,...grid.integrate(scan,C.transform)});
  const points=scan.points.filter(p=>Math.hypot(...p)<=12).map(p=>C.transform(p,scan.pose));
  segments.push(...S.extract(points).map((geometry,index)=>({label:`${scan.name} L${index+1}`,color:C.color(sources.findIndex(s=>s.name===scan.name)),segment:S.segment(geometry.a,geometry.b),sources:[{name:scan.name,checksum:scan.checksum,pose:{...scan.pose}}]})));
  vectorReports.push({name:scan.name,...vector.integrate(scan)});
 }
 fs.writeFileSync(path.join(destination,'grille.json'),grid.save());fs.writeFileSync(path.join(destination,'grille.csv'),grid.csv());
 fs.writeFileSync(path.join(destination,'segments.json'),S.save(segments));fs.writeFileSync(path.join(destination,'segments.csv'),S.csv(segments));
 fs.writeFileSync(path.join(destination,'carte_vectorielle.json'),vector.save());fs.writeFileSync(path.join(destination,'carte_vectorielle.csv'),vector.csv());
 assert.deepEqual(Grid.load(grid.save()).cells,grid.cells);assert.deepEqual(VectorMap.load(vector.save()).features,vector.features);assert.equal(S.load(S.save(segments)).length,segments.length);
 const summary={name,description,scanCount:active.length,validPoints:cloud.length,segments:segments.length,grid:{resolution,x,y,width:grid.width,height:grid.height,nx:grid.nx,ny:grid.ny,...grid.counts()},vector:vector.stats(),gridReports,vectorReports,
  caveat:'Automatic estimated poses, not measured ground truth. See alignment quality; order-dependent updates. Group frames are separate.'};
 fs.writeFileSync(path.join(destination,'bilan.json'),JSON.stringify(summary,null,2));
 // Geometry for independent plotting and audit; no replacement of original CSVs.
 const drawing={summary,scans:records.map(r=>({label:r.label,name:r.name,pose:r.pose,color:C.color(r.index)})),cloud,vector:vector.features};
 fs.writeFileSync(path.join(destination,'donnees_traces.json'),JSON.stringify(drawing));
 console.log(`${name}: ${active.length} scans, ${cloud.length} points, ${segments.length} segments, ${vector.features.length} primitives.`);
 return summary;
}
const reports=[];
for(const group of alignment.components)reports.push(buildSet(`groupe_${String(group.component).padStart(2,'0')}`,group.scans,`Composante ${group.component}, référence ${group.reference}. Liens retenus avec contrôle d'ambiguïté et de cohérence.`));
reports.push(buildSet(`exploratoire_${sources.length}_scans`,alignment.exploratory.scans,'Tous les scans dans un repère provisoire : liens faibles inclus, ne pas présenter comme carte validée.'));
fs.writeFileSync(path.join(folder,'synthese.json'),JSON.stringify({totalScans:sources.length,validPoints:sources.reduce((n,s)=>n+s.points.length,0),groups:reports},null,2));
console.log('Reload/geometry checks passed for every generated group.');
