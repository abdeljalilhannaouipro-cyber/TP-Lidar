// Rejeu séquentiel : vérité simulée réservée aux métriques, jamais au moteur SLAM.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const C=require('../visualisation/core.js'),M=require('../visualisation/scan-matching.js');
const {Session}=require('./session.js'),{scene}=require('../localisation/grid/scene.cjs'),{VectorMap}=require('../visualisation/vector-map.js');
const root=path.resolve(__dirname,'..'),dest=path.join(__dirname,'resultats');fs.mkdirSync(dest,{recursive:true});
const sim=scene(),truths=[];
for(let i=0;i<=16;i++)truths.push({x:-2+i*.25,y:-2,theta:10*Math.sin(i*Math.PI/32)});
for(let i=1;i<=16;i++)truths.push({x:2-i*.25,y:-2,theta:10*Math.sin((16+i)*Math.PI/32)});
const simulated=truths.map((p,i)=>({...sim.scan(p,360,.004,12345+i),name:`simulation_${String(i).padStart(2,'0')}.csv`}));
function run(name,scans,priors=null,expected=null,description=''){
 const session=new Session(),rows=[];
 for(let i=0;i<scans.length;i++){
  try{
   const result=session.add(scans[i],priors?priors[i]:null),truth=expected?.[i];
   rows.push({...result,error:truth&&result.status!=='rejected'?{positionM:Math.hypot(result.pose.x-truth.x,result.pose.y-truth.y),angleDeg:Math.abs(((result.pose.theta-truth.theta+180)%360+360)%360-180)}:null});
  }catch(e){rows.push({name:scans[i].name,status:'error',reason:e.message});}
  console.log(name,i+1,rows.at(-1).status,rows.at(-1).reasons?.join(';')||rows.at(-1).reason||'');
 }
 const output=path.join(dest,name);fs.mkdirSync(output,{recursive:true});
 const accepted=rows.filter(r=>['accepted','anchor'].includes(r.status)),errors=accepted.filter(r=>r.error);
 const mean=(key)=>errors.length?errors.reduce((s,r)=>s+r.error[key],0)/errors.length:null;
 const summary={name,description,inputScans:scans.length,acceptedScans:session.accepted.length,rejectedScans:rows.filter(r=>r.status==='rejected').length,
  errors:rows.filter(r=>r.status==='error').length,initialisation:priors?'Explicit TP1 estimated poses, assistance, not ground truth':'Previous accepted estimate only; first scan defines origin',
  truthAvailable:!!expected,meanPositionM:mean('positionM'),meanAngleDeg:mean('angleDeg'),
  successCount:expected?errors.filter(r=>r.error.positionM<=.2&&r.error.angleDeg<=2).length:null,successDenominator:expected?scans.length:null,
  maxPositionM:errors.length?Math.max(...errors.map(r=>r.error.positionM)):null,
  finalError:expected?(rows.at(-1).error||null):null,
  meanTimeMs:rows.reduce((s,r)=>s+(r.elapsedMs||0),0)/rows.length,grid:session.grid.counts(),
  roomCoverageFraction:null,physicalUncertainty:'unknown',closedLoopOptimisation:false};
 fs.writeFileSync(path.join(output,'session.json'),session.save());fs.writeFileSync(path.join(output,'grille.json'),session.grid.save());
 fs.writeFileSync(path.join(output,'grille.csv'),session.grid.csv());fs.writeFileSync(path.join(output,'points.csv'),C.exportPoints(session.accepted));
 const vector=new VectorMap();for(const scan of session.accepted)vector.integrate(scan);
 fs.writeFileSync(path.join(output,'carte_vectorielle.json'),vector.save());
 fs.writeFileSync(path.join(output,'bilan.json'),JSON.stringify({...summary,rows},null,2));
 fs.writeFileSync(path.join(output,'donnees_traces.json'),JSON.stringify({summary,grid:JSON.parse(session.grid.save()),scans:session.accepted,
  expected,events:rows,vector:vector.features},null,2));
 if(Session.load(session.save()).grid.save()!==session.grid.save())throw Error('Session non reproductible.');
 return{summary,session,rows};
}
const reports=[];
reports.push(run('simulation',simulated,null,truths.map(p=>M.relative(truths[0],p)),'Trajet aller-retour simulé, scans indépendants, vérité utilisée seulement après estimation.'));
const alignment=JSON.parse(fs.readFileSync(path.join(root,'traitement_complet/resultats_19_scans/alignement.json'),'utf8'));
const scans=alignment.inputs.map(r=>C.parseScan(fs.readFileSync(path.join(root,r.path),'utf8'),r.name));
reports.push(run('reel_19_sans_assistance',scans,null,null,'Ordre chronologique, sans poses TP1 ni réinitialisation après rejet. Les refus ne sont pas masqués.'));
reports.push(run('reel_AB_sans_assistance',scans.slice(17),null,null,'Deux captures A/B, initialisation par la dernière pose, déplacement déclaré de 50 cm non transmis au moteur.'));
for(const g of alignment.components){
 const nodes=g.scans.slice().sort((a,b)=>a.index-b.index);
 reports.push(run(`reel_groupe_${g.component}_assiste`,nodes.map(r=>scans[r.index]),nodes.map(r=>r.pose),null,
  'Rejeu aidé par les poses estimées du TP1 pour initialiser chaque scan. Repère indépendant, ne constitue pas un parcours autonome.'));
}
const demo=alignment.components[0].scans.map(r=>({scan:scans[r.index],prior:r.pose}));
const examples={simulation:{scans:simulated.map(s=>({...s,pose:{x:0,y:0,theta:0}})),truths:truths.map(p=>M.relative(truths[0],p)),description:'Simulation : initialisation par la pose précédente, vérité masquée au moteur.'},
 room:{scans:demo.map(r=>r.scan),priors:demo.map(r=>r.prior),description:'7 captures réelles, initialisations issues du TP1. Rejeu assisté ; carte complète de la salle non certifiée.'}};
fs.writeFileSync(path.join(__dirname,'exemples.js'),'window.LIDAR_SLAM_EXAMPLES = '+JSON.stringify(examples)+';\n');
fs.writeFileSync(path.join(dest,'synthese.json'),JSON.stringify({format:'tp3-slam-evaluation-v1',environment:{node:process.version,cpu:os.cpus()[0].model},
 thresholds:{positionM:.2,angleDeg:2},summaries:reports.map(r=>r.summary)},null,2));
console.log(JSON.stringify(reports.map(r=>r.summary),null,2));
