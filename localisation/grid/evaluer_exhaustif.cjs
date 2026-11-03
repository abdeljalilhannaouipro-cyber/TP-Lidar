const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const B=require('../../visualisation/grid-brute-force.js'),L=require('../../visualisation/grid-localisation.js'),C=require('../../visualisation/core.js'),{Grid}=require('../../visualisation/grid.js'),{scene}=require('./scene.cjs');
const root=path.resolve(__dirname,'../..'),dest=path.join(__dirname,'resultats'),previous=JSON.parse(fs.readFileSync(path.join(dest,'evaluation.json'),'utf8'));
const alignment=JSON.parse(fs.readFileSync(path.join(root,'traitement_complet/resultats/alignement.json'),'utf8')),group=alignment.components.find(g=>g.scans.length===5);
const scans=group.scans.map(r=>{const i=alignment.inputs[r.index];return C.parseScan(fs.readFileSync(path.join(root,i.path),'utf8'),i.name);});
const sceneData=scene(),synthetic=[],real=[];
function run(old,grid,scan){
 const baseline=L.match(grid,scan,old.result.initial),result=B.match(grid,scan,old.result.initial),ref=old.referencePose;
 const error=p=>({translationM:Math.hypot(p.x-ref.x,p.y-ref.y),angleDeg:Math.abs(L.wrap(p.theta-ref.theta))});
 const record={label:old.label,kind:old.kind,referenceType:old.referenceType,referencePose:ref,initialError:old.initialError,finalError:error(result.pose),success:error(result.pose).translationM<=.2&&error(result.pose).angleDeg<=2,result,comparison:{baselineMethod:baseline.method,baselineTimeMs:baseline.elapsedMs,baselineTested:baseline.tested,baselineError:error(baseline.pose),baselineScore:baseline.after.score}};
 console.log(old.label,JSON.stringify({tested:result.tested,error:record.finalError,ms:result.elapsedMs}));return record;
}
for(const c of previous.synthetic)synthetic.push(run(c,sceneData.grid,sceneData.scan(c.referencePose)));
for(const c of previous.real){const i=Number(/^R(\d+)-/.exec(c.label)[1])-1,grid=Grid.load(fs.readFileSync(path.join(dest,`grille_sans_scan_${i+1}.json`),'utf8'));real.push(run(c,grid,scans[i]));}
function summary(rows){const mean=f=>rows.reduce((s,r)=>s+f(r),0)/rows.length;return{cases:rows.length,success:rows.filter(r=>r.success).length,meanInitialTranslationM:mean(r=>r.initialError.translationM),meanFinalTranslationM:mean(r=>r.finalError.translationM),meanFinalAngleDeg:mean(r=>r.finalError.angleDeg),meanElapsedMs:mean(r=>r.result.elapsedMs),meanBaselineTimeMs:mean(r=>r.comparison.baselineTimeMs),meanCoverage:mean(r=>r.result.after.coverage),meanScore:mean(r=>r.result.after.score),maxFinalTranslationM:Math.max(...rows.map(r=>r.finalError.translationM)),posesPerTrial:13671};}
const report={format:'tp2-grid-exhaustive-evaluation-v1',created:new Date().toISOString(),environment:{node:process.version,cpu:os.cpus()[0].model},method:'Full enumeration: all accepted points, window ±1 m / ±15 deg, steps 0.1 m / 1 deg, sigma 0.1 m',successCriterion:previous.successCriterion,syntheticSummary:summary(synthetic),realSummary:summary(real),synthetic,real,caveats:previous.caveats};
fs.writeFileSync(path.join(dest,'evaluation_exhaustive.json'),JSON.stringify(report,null,2));
const rows=[...synthetic,...real].map(r=>[r.label,r.kind,r.result.tested,r.initialError.translationM,r.finalError.translationM,r.finalError.angleDeg,r.result.after.score,r.result.after.coverage,r.result.elapsedMs,r.comparison.baselineTimeMs,r.success].join(','));
fs.writeFileSync(path.join(dest,'evaluation_exhaustive.csv'),['case,type,poses,initial_translation_m,final_translation_m,final_angle_deg,score,coverage,time_ms,multilevel_time_ms,success',...rows].join('\n'));
console.log(JSON.stringify({synthetic:report.syntheticSummary,real:report.realSummary},null,2));
