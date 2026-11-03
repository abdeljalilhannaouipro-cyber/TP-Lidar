// Contrôle des résultats générés, indépendant de la procédure de calcul.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const C=require('../visualisation/core.js'),S=require('../visualisation/segments.js'),{Grid}=require('../visualisation/grid.js'),{VectorMap}=require('../visualisation/vector-map.js');
const root=path.resolve(__dirname,'..'),folder=path.join(__dirname,'resultats');
const alignment=JSON.parse(fs.readFileSync(path.join(folder,'alignement.json'),'utf8'));
const source=alignment.inputs.map(r=>C.parseScan(fs.readFileSync(path.join(root,r.path),'utf8'),r.name));
assert.equal(source.length,17);assert.equal(source.reduce((n,s)=>n+s.points.length,0),7745);
const datasets=alignment.components.map(group=>({name:`groupe_${String(group.component).padStart(2,'0')}`,records:group.scans}));
datasets.push({name:'exploratoire_17_scans',records:alignment.exploratory.scans});
for(const dataset of datasets){
 const directory=path.join(folder,dataset.name),summary=JSON.parse(fs.readFileSync(path.join(directory,'bilan.json'),'utf8'));
 const poses=C.readPoses(fs.readFileSync(path.join(directory,'poses.json'),'utf8'),source);
 assert.equal(poses.length,17);assert.equal(poses.filter(p=>p.visible).length,dataset.records.length);
 const grid=Grid.load(fs.readFileSync(path.join(directory,'grille.json'),'utf8')),map=VectorMap.load(fs.readFileSync(path.join(directory,'carte_vectorielle.json'),'utf8'));
 assert.equal(grid.scans.length,dataset.records.length);assert.equal(map.scans.length,dataset.records.length);
 assert.deepEqual(grid.counts(),{free:summary.grid.free,occupied:summary.grid.occupied,unknown:summary.grid.unknown});
 assert.equal(grid.cells.length,summary.grid.free+summary.grid.occupied+summary.grid.unknown);
 assert.equal(map.features.length,summary.vector.features);
 assert.equal(S.load(fs.readFileSync(path.join(directory,'segments.json'),'utf8')).length,summary.segments);
 const points=C.table(fs.readFileSync(path.join(directory,'points_alignés.csv'),'utf8'));assert.equal(points.length-1,summary.validPoints);
 for(const record of dataset.records){
  const scan=source[record.index],p=scan.points[0],a=C.transform(p,record.pose),b=C.transform(scan.points.at(-1),record.pose);
  assert.ok(Math.abs(Math.hypot(a[0]-b[0],a[1]-b[1])-Math.hypot(p[0]-scan.points.at(-1)[0],p[1]-scan.points.at(-1)[1]))<1e-8);
 }
 for(const filename of ['alignement.png','grille.png','vectorielle.png'])assert.ok(fs.statSync(path.join(directory,filename)).size>1000);
 console.log('OK results:',dataset.name);
}
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'visualisation/pose-presets.js'),'utf8'),sandbox);
assert.equal(sandbox.window.LIDAR_POSE_PRESETS.length,8);
console.log('17 source scans, 8 complete result sets, pose presets and rigid-distance checks verified.');
