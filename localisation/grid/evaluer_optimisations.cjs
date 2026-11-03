const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const O=require('../../visualisation/grid-optimisation.js'),L=require('../../visualisation/grid-localisation.js'),C=require('../../visualisation/core.js'),{Grid}=require('../../visualisation/grid.js'),{scene}=require('./scene.cjs');
const root=path.resolve(__dirname,'../..'),dest=path.join(__dirname,'resultats'),previous=JSON.parse(fs.readFileSync(path.join(dest,'evaluation.json'),'utf8'));
const alignment=JSON.parse(fs.readFileSync(path.join(root,'traitement_complet/resultats/alignement.json'),'utf8')),group=alignment.components.find(g=>g.scans.length===5);
const scans=group.scans.map(r=>{const i=alignment.inputs[r.index];return C.parseScan(fs.readFileSync(path.join(root,i.path),'utf8'),i.name);}),s=scene();
const inputs=[...previous.synthetic.map(old=>({old,grid:s.grid,scan:s.scan(old.referencePose)})),...previous.real.map(old=>{const i=Number(/^R(\d+)-/.exec(old.label)[1])-1;return{old,grid:Grid.load(fs.readFileSync(path.join(dest,`grille_sans_scan_${i+1}.json`),'utf8')),scan:scans[i]};})];
function summary(rows){const mean=f=>rows.reduce((s,r)=>s+f(r),0)/rows.length;return{cases:rows.length,success:rows.filter(r=>r.success).length,meanInitialTranslationM:mean(r=>r.initialError.translationM),meanFinalTranslationM:mean(r=>r.finalError.translationM),meanFinalAngleDeg:mean(r=>r.finalError.angleDeg),meanElapsedMs:mean(r=>r.result.elapsedMs),meanEvaluations:mean(r=>r.result.tested),meanCoverage:mean(r=>r.result.after.coverage),meanScore:mean(r=>r.result.after.score),maxFinalTranslationM:Math.max(...rows.map(r=>r.finalError.translationM)),maxFinalAngleDeg:Math.max(...rows.map(r=>r.finalError.angleDeg))};}
const reports={};
for(const method of ['gradient','pyramid','annealing']){
 const synthetic=[],real=[],seeds=method==='annealing'?[20261103,20261104,20261105]:[20261103];
 for(const{old,grid,scan}of inputs)for(const seed of seeds){
  const result=O.match(grid,scan,old.result.initial,{method,seed}),ref=old.referencePose,error=p=>({translationM:Math.hypot(p.x-ref.x,p.y-ref.y),angleDeg:Math.abs(L.wrap(p.theta-ref.theta))});
  const r={label:old.label,seed,kind:old.kind,referenceType:old.referenceType,referencePose:ref,initialError:old.initialError,finalError:error(result.pose),success:error(result.pose).translationM<=.2&&error(result.pose).angleDeg<=2,result};
  (old.kind==='synthetic'?synthetic:real).push(r);
  console.log(method,old.label,seed,JSON.stringify({error:r.finalError,success:r.success,ms:result.elapsedMs,stop:result.stopReason}));
 }
 const report={format:'tp2-grid-optimisation-evaluation-v1',method,created:new Date().toISOString(),environment:{node:process.version,cpu:os.cpus()[0].model},successCriterion:previous.successCriterion,seeds,syntheticSummary:summary(synthetic),realSummary:summary(real),synthetic,real,caveats:[...previous.caveats,'Annealing seeds and repeated offsets are correlated computational trials, not independent acquisitions.']};
 fs.writeFileSync(path.join(dest,`evaluation_${method}.json`),JSON.stringify(report,null,2));
 const rows=[...synthetic,...real].map(r=>[r.label,r.seed,r.kind,r.initialError.translationM,r.finalError.translationM,r.finalError.angleDeg,r.result.after.score,r.result.after.coverage,r.result.elapsedMs,r.result.tested,r.result.stopReason,r.success].join(','));
 fs.writeFileSync(path.join(dest,`evaluation_${method}.csv`),['case,seed,type,initial_translation_m,final_translation_m,final_angle_deg,score,coverage,time_ms,evaluations,stop,success',...rows].join('\n'));
 reports[method]={synthetic:report.syntheticSummary,real:report.realSummary};
}
fs.writeFileSync(path.join(dest,'comparaison_optimisations.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports,null,2));
