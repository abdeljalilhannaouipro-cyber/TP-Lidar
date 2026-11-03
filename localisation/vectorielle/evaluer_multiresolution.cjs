const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const M=require('../../visualisation/vector-multiresolution.js'),L=require('../../visualisation/grid-localisation.js'),C=require('../../visualisation/core.js'),{VectorMap}=require('../../visualisation/vector-map.js'),{scene}=require('../grid/scene.cjs');
const root=path.resolve(__dirname,'../..'),dest=path.join(__dirname,'resultats'),previous=JSON.parse(fs.readFileSync(path.join(dest,'evaluation.json'),'utf8'));
const alignment=JSON.parse(fs.readFileSync(path.join(root,'traitement_complet/resultats/alignement.json'),'utf8')),group=alignment.components.find(g=>g.scans.length===5),scans=group.scans.map(r=>{const i=alignment.inputs[r.index];return C.parseScan(fs.readFileSync(path.join(root,i.path),'utf8'),i.name);});
const s=scene(),map=new VectorMap();map.seed(s.walls.map(([a,b])=>({a,b})));const synthetic=[],real=[];
function run(old,map,scan){
 const result=M.match(map,scan,old.result.initial),ref=old.referencePose,error=p=>({translationM:Math.hypot(p.x-ref.x,p.y-ref.y),angleDeg:Math.abs(L.wrap(p.theta-ref.theta))});
 const r={label:old.label,kind:old.kind,referenceType:old.referenceType,referencePose:ref,initialError:old.initialError,referenceSupport:old.referenceSupport,finalError:error(result.pose),success:error(result.pose).translationM<=.2&&error(result.pose).angleDeg<=2,result};
 console.log(r.label,JSON.stringify({error:r.finalError,success:r.success,tested:result.tested,points:result.levels.map(l=>l.points),ms:result.elapsedMs}));return r;
}
for(const old of previous.synthetic)synthetic.push(run(old,map,s.scan(old.referencePose)));
for(const old of previous.real){const i=Number(/^R(\d+)-/.exec(old.label)[1])-1;real.push(run(old,VectorMap.load(fs.readFileSync(path.join(dest,`carte_sans_scan_${i+1}.json`),'utf8')),scans[i]));}
function summary(rows){const mean=f=>rows.reduce((s,r)=>s+f(r),0)/rows.length;return{cases:rows.length,success:rows.filter(r=>r.success).length,meanInitialTranslationM:mean(r=>r.initialError.translationM),meanFinalTranslationM:mean(r=>r.finalError.translationM),meanFinalAngleDeg:mean(r=>r.finalError.angleDeg),meanElapsedMs:mean(r=>r.result.elapsedMs),meanEvaluations:mean(r=>r.result.tested),meanSupport:mean(r=>r.result.after.nearFraction),maxFinalTranslationM:Math.max(...rows.map(r=>r.finalError.translationM))};}
const report={format:'tp2-vector-multiresolution-evaluation-v1',created:new Date().toISOString(),environment:{node:process.version,cpu:os.cpus()[0].model},successCriterion:previous.successCriterion,syntheticSummary:summary(synthetic),realSummary:summary(real),synthetic,real,caveats:previous.caveats};
fs.writeFileSync(path.join(dest,'evaluation_multiresolution.json'),JSON.stringify(report,null,2));
const rows=[...synthetic,...real].map(r=>[r.label,r.kind,r.initialError.translationM,r.finalError.translationM,r.finalError.angleDeg,r.result.after.cost,r.result.after.nearFraction,r.result.elapsedMs,r.result.tested,r.success].join(','));
fs.writeFileSync(path.join(dest,'evaluation_multiresolution.csv'),['case,type,initial_xy_m,final_xy_m,final_angle_deg,cost_m2,support,time_ms,evaluations,success',...rows].join('\n'));
const demo=JSON.parse(fs.readFileSync(path.join(dest,'exemple.json'),'utf8')),trial=real.find(r=>r.label===demo.source),points=L.prepare(demo.scan,trial.result.options);
fs.writeFileSync(path.join(dest,'niveaux_multiresolution.json'),JSON.stringify({map:demo.map,levels:trial.result.levels.map(l=>({...l,cloud:M.voxel(points,l.voxelSizeM)}))}));
console.log(JSON.stringify({synthetic:report.syntheticSummary,real:report.realSummary},null,2));
