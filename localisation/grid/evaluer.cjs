const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const C=require('../../visualisation/core.js'),{Grid}=require('../../visualisation/grid.js'),L=require('../../visualisation/grid-localisation.js'),{scene}=require('./scene.cjs');
const root=path.resolve(__dirname,'../..'),dest=path.join(__dirname,'resultats');fs.mkdirSync(dest,{recursive:true});
const offsets=[[.537,-.413,7.3],[-.467,.559,-8.2],[.263,.371,5.4]],synthetic=[],real=[];
function run(grid,scan,ref,offset,label,kind){
 const initial={x:ref.x+offset[0],y:ref.y+offset[1],theta:L.wrap(ref.theta+offset[2])};
 const result=L.match(grid,scan,initial);
 const error=p=>({translationM:Math.hypot(p.x-ref.x,p.y-ref.y),angleDeg:Math.abs(L.wrap(p.theta-ref.theta))});
 const record={label,kind,referencePose:ref,referenceType:kind==='synthetic'?'synthetic_ground_truth':'TP1_estimated_pseudo_reference_not_ground_truth',initialError:error(initial),finalError:error(result.pose),success:error(result.pose).translationM<=.2&&error(result.pose).angleDeg<=2,result};
 console.log(label,JSON.stringify({before:record.initialError,after:record.finalError,score:result.after.score,coverage:result.after.coverage,ms:result.elapsedMs}));return record;
}
const s=scene(),poses=[{x:1.8,y:-1.5,theta:22},{x:-2,y:1.5,theta:-35},{x:-2,y:-2,theta:110}];
for(const [i,p]of poses.entries())for(const [j,o]of offsets.entries())synthetic.push(run(s.grid,s.scan(p),p,o,`S${i+1}-${j+1}`,'synthetic'));
const alignment=JSON.parse(fs.readFileSync(path.join(root,'traitement_complet/resultats/alignement.json'),'utf8'));
const group=alignment.components.find(g=>g.scans.length===5);
const scans=group.scans.map(r=>{const input=alignment.inputs[r.index];return{...C.parseScan(fs.readFileSync(path.join(root,input.path),'utf8'),input.name),pose:{...r.pose}};});
let demo=null;
for(let i=0;i<scans.length;i++){
 const template=JSON.parse(fs.readFileSync(path.join(root,'traitement_complet/resultats/groupe_01/grille.json'),'utf8'));
 const grid=new Grid({resolution:template.resolution,x:template.x,y:template.y,width:template.nx*template.resolution,height:template.ny*template.resolution});
 for(let j=0;j<scans.length;j++)if(i!==j)grid.integrate(scans[j],C.transform);
 fs.writeFileSync(path.join(dest,`grille_sans_scan_${i+1}.json`),grid.save());
 for(const[j,o]of offsets.entries()){
  const record=run(grid,scans[i],scans[i].pose,o,`R${i+1}-${j+1}`,'real_leave_one_out');real.push(record);
  if(!demo&&record.success&&record.result.quality==='criteres_satisfaits')demo={grid:JSON.parse(grid.save()),scan:scans[i],initial:record.result.initial,pseudoReference:scans[i].pose,source:record.label};
 }
}
function summary(rows){const mean=fn=>rows.reduce((s,r)=>s+fn(r),0)/rows.length;return{cases:rows.length,success:rows.filter(r=>r.success).length,meanInitialTranslationM:mean(r=>r.initialError.translationM),meanFinalTranslationM:mean(r=>r.finalError.translationM),meanFinalAngleDeg:mean(r=>r.finalError.angleDeg),meanScore:mean(r=>r.result.after.score),meanCoverage:mean(r=>r.result.after.coverage),meanElapsedMs:mean(r=>r.result.elapsedMs),maxFinalTranslationM:Math.max(...rows.map(r=>r.finalError.translationM))};}
const report={format:'tp2-grid-evaluation-v1',created:new Date().toISOString(),environment:{node:process.version,platform:process.platform,cpu:os.cpus()[0].model},successCriterion:'translation <= 0.20 m and angle <= 2 deg relative to indicated reference',syntheticSummary:summary(synthetic),realSummary:summary(real),synthetic,real,
 caveats:['Synthetic accuracy is measured in a simulated known scene, not in the physical classroom.','Real query scan excluded from occupancy map; reference poses and training poses come from TP1 estimation using the complete group. This is not a fully independent ground-truth evaluation.','Three initial offsets per scan are correlated repeat trials, not independent acquisitions.','Search is local, not global, and thresholds have no probabilistic calibration.']};
if(!demo)demo={grid:JSON.parse(s.grid.save()),scan:s.scan(poses[0]),initial:synthetic[0].result.initial,pseudoReference:null,source:'synthetic'};
fs.writeFileSync(path.join(dest,'evaluation.json'),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(dest,'exemple.json'),JSON.stringify(demo));
fs.writeFileSync(path.join(root,'visualisation/grid-localisation-example.js'),'window.LIDAR_GRID_LOCALISATION_EXAMPLE='+JSON.stringify(demo)+';\n');
const header='case,type,initial_translation_m,final_translation_m,final_angle_deg,score,coverage,time_ms,success';
const rows=[...synthetic,...real].map(r=>[r.label,r.kind,r.initialError.translationM,r.finalError.translationM,r.finalError.angleDeg,r.result.after.score,r.result.after.coverage,r.result.elapsedMs,r.success].join(','));
fs.writeFileSync(path.join(dest,'evaluation.csv'),[header,...rows].join('\n'));
console.log(JSON.stringify({synthetic:report.syntheticSummary,real:report.realSummary},null,2));
