const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const A=require('../../visualisation/vector-annealing.js'),L=require('../../visualisation/grid-localisation.js'),C=require('../../visualisation/core.js'),{VectorMap}=require('../../visualisation/vector-map.js'),{scene}=require('../grid/scene.cjs');
const root=path.resolve(__dirname,'../..'),dest=path.join(__dirname,'resultats'),previous=JSON.parse(fs.readFileSync(path.join(dest,'evaluation.json'),'utf8'));
const alignment=JSON.parse(fs.readFileSync(path.join(root,'traitement_complet/resultats/alignement.json'),'utf8')),group=alignment.components.find(g=>g.scans.length===5),scans=group.scans.map(r=>{const i=alignment.inputs[r.index];return C.parseScan(fs.readFileSync(path.join(root,i.path),'utf8'),i.name);});
const s=scene(),map=new VectorMap();map.seed(s.walls.map(([a,b])=>({a,b})));const synthetic=[],real=[],seeds=[20261103,20261104,20261105];
function run(old,map,scan,seed){
 const result=A.match(map,scan,old.result.initial,{seed}),ref=old.referencePose,error=p=>({translationM:Math.hypot(p.x-ref.x,p.y-ref.y),angleDeg:Math.abs(L.wrap(p.theta-ref.theta))});
 const r={label:old.label,seed,kind:old.kind,referenceType:old.referenceType,referencePose:ref,initialError:old.initialError,referenceSupport:old.referenceSupport,finalError:error(result.pose),success:error(result.pose).translationM<=.2&&error(result.pose).angleDeg<=2,result};
 console.log(r.label,seed,JSON.stringify({error:r.finalError,success:r.success,tested:result.tested,ms:result.elapsedMs}));return r;
}
for(const old of previous.synthetic)for(const seed of seeds)synthetic.push(run(old,map,s.scan(old.referencePose),seed));
for(const old of previous.real){const i=Number(/^R(\d+)-/.exec(old.label)[1])-1,reference=VectorMap.load(fs.readFileSync(path.join(dest,`carte_sans_scan_${i+1}.json`),'utf8'));for(const seed of seeds)real.push(run(old,reference,scans[i],seed));}
function summary(rows){const mean=f=>rows.reduce((s,r)=>s+f(r),0)/rows.length;return{cases:rows.length,success:rows.filter(r=>r.success).length,meanInitialTranslationM:mean(r=>r.initialError.translationM),meanFinalTranslationM:mean(r=>r.finalError.translationM),meanFinalAngleDeg:mean(r=>r.finalError.angleDeg),meanElapsedMs:mean(r=>r.result.elapsedMs),meanEvaluations:mean(r=>r.result.tested),meanSupport:mean(r=>r.result.after.nearFraction),maxFinalTranslationM:Math.max(...rows.map(r=>r.finalError.translationM))};}
const report={format:'tp2-vector-annealing-evaluation-v1',created:new Date().toISOString(),environment:{node:process.version,cpu:os.cpus()[0].model},seeds,successCriterion:previous.successCriterion,syntheticSummary:summary(synthetic),realSummary:summary(real),bySeed:seeds.map(seed=>({seed,synthetic:summary(synthetic.filter(r=>r.seed===seed)),real:summary(real.filter(r=>r.seed===seed))})),synthetic,real,caveats:[...previous.caveats,'Different seeds are correlated computational repeats, not new acquisitions.']};
fs.writeFileSync(path.join(dest,'evaluation_probabiliste.json'),JSON.stringify(report,null,2));
const rows=[...synthetic,...real].map(r=>[r.label,r.seed,r.kind,r.initialError.translationM,r.finalError.translationM,r.finalError.angleDeg,r.result.after.cost,r.result.after.nearFraction,r.result.elapsedMs,r.result.tested,r.success].join(','));
fs.writeFileSync(path.join(dest,'evaluation_probabiliste.csv'),['case,seed,type,initial_xy_m,final_xy_m,final_angle_deg,cost_m2,support,time_ms,evaluations,success',...rows].join('\n'));
console.log(JSON.stringify({synthetic:report.syntheticSummary,real:report.realSummary},null,2));
