'use strict';
let vectorLocJob=0,vectorLocRunning=false,vectorLocResult=null;
if(!['exhaustive','gradient','multiresolution','annealing'].includes($('vlMethod').value))$('vlMethod').value='exhaustive';
function vectorLocNumber(id){const text=String($(id).value);if(!text.trim()||!Number.isFinite(Number(text)))throw new Error('Champ de localisation vectorielle invalide.');return Number(text);}
function vectorLocCurrent(){const r=vectorLocResult;return !!r&&state.vector===r.map&&r.map.version===r.version&&state.selected===r.scan.id&&state.scans.includes(r.scan)&&['x','y','theta'].every(k=>r.scan.pose[k]===r.originalPose[k]);}
function updateVectorLocalisationStatus(){
 const scan=state.scans.find(s=>s.id===state.selected);
 $('vlRun').disabled=vectorLocRunning||!scan||!state.vector?.features.length;
 $('vlUsePose').disabled=vectorLocRunning||!scan;$('vlCancel').disabled=!vectorLocRunning;
 $('vlApply').disabled=vectorLocRunning||!vectorLocCurrent();$('vlExport').disabled=!vectorLocResult;
 $('vlMethod').disabled=vectorLocRunning;
 for(const id of ['vlStepXY','vlStepAngle'])$(id).disabled=vectorLocRunning||$('vlMethod').value!=='exhaustive';
 $('vlIterations').disabled=vectorLocRunning||$('vlMethod').value!=='gradient';
 for(const id of ['vlChains','vlAnnealIterations','vlSeed'])$(id).disabled=vectorLocRunning||$('vlMethod').value!=='annealing';
 $('vlTarget').textContent=scan?`Scan : ${scan.name} · Carte : ${state.vector?.features.length||0} segments`:'Charger une carte vectorielle et sélectionner un scan indépendant.';
}
$('vlUsePose').onclick=()=>{const s=state.scans.find(s=>s.id===state.selected);if(s)for(const[k,id]of Object.entries({x:'vlX',y:'vlY',theta:'vlTheta'}))$(id).value=String(s.pose[k]);};
$('vlRun').onclick=async()=>{
 const job=++vectorLocJob;
 try{
  const scan=state.scans.find(s=>s.id===state.selected),map=state.vector;
  if(!scan||!map)throw new Error('Charger une carte vectorielle et sélectionner un scan.');
  const initial={x:vectorLocNumber('vlX'),y:vectorLocNumber('vlY'),theta:vectorLocNumber('vlTheta')};
  const options={windowXY:vectorLocNumber('vlXY'),windowTheta:vectorLocNumber('vlAngle'),capM:vectorLocNumber('vlCap'),maxRange:vectorLocNumber('vlRange'),minIntensity:vectorLocNumber('vlIntensity')};
  const gradient=$('vlMethod').value==='gradient';
  const multiresolution=$('vlMethod').value==='multiresolution';
  const annealing=$('vlMethod').value==='annealing';
  if(gradient)options.maxIterations=vectorLocNumber('vlIterations');else if(annealing){options.chains=vectorLocNumber('vlChains');options.annealIterations=vectorLocNumber('vlAnnealIterations');options.seed=vectorLocNumber('vlSeed');}else if(!multiresolution){options.stepXY=vectorLocNumber('vlStepXY');options.stepTheta=vectorLocNumber('vlStepAngle');}
  const version=map.version,originalPose={...scan.pose},mapText=map.save();vectorLocRunning=true;vectorLocResult=null;updateVectorLocalisationStatus();
  const engine=gradient?LidarVectorGradient:multiresolution?LidarVectorMultiresolution:annealing?LidarVectorAnnealing:LidarVectorLocalisation;
  const result=await engine.matchAsync(map,scan,initial,options,p=>{$('vlReport').textContent=gradient?`Gradient vectoriel : itération ${p.iteration}, ${p.tested} évaluations…`:multiresolution?`Multi-résolution vectorielle : niveau ${p.level}/3, ${p.points} points, ${p.tested} poses évaluées…`:annealing?`Recuit vectoriel : chaîne ${p.chain}/${p.chains}, tentative ${p.iteration}, ${p.tested} évaluations…`:`Recherche exhaustive vectorielle : ${p.tested} / ${p.total} poses…`;},()=>job!==vectorLocJob);
  vectorLocResult={map,version,scan,originalPose,mapText,result};
  if(!vectorLocCurrent()){vectorLocResult=null;throw new Error('Carte ou scan modifié pendant la recherche : relancer.');}
  const p=result.pose;
  const stops={small_gradient:'gradient faible',small_update:'variation devenue faible',line_search_stalled:'aucun pas de descente accepté',iteration_limit:'budget maximal atteint',flat_truncation:'plateau du coût tronqué'};
  const details=gradient?`${result.iterations} itérations, ${result.tested} évaluations ; arrêt : ${stops[result.stopReason]||result.stopReason}`:multiresolution?`3 niveaux, ${result.tested} poses ; points par niveau : ${result.levels.map(l=>l.points).join(' → ')}`:annealing?`${result.attemptedMoves} tentatives ; ${result.acceptedMoves} acceptées, dont ${result.uphillMoves} montées ; graine ${result.seed}`:`${result.tested}/${result.totalCandidates} poses`;
  $('vlReport').textContent=`${gradient?'Descente de gradient':multiresolution?'Multi-résolution':annealing?'Probabiliste : recuit simulé':'Recherche exhaustive'}\nPose proposée : x=${p.x.toFixed(3)} m ; y=${p.y.toFixed(3)} m ; θ=${p.theta.toFixed(2)}°\nCoût tronqué : ${result.before.cost.toFixed(4)} → ${result.after.cost.toFixed(4)} m²\nImpacts à moins de 20 cm des segments : ${(100*result.after.nearFraction).toFixed(1)} %\n${details} ; ${result.elapsedMs.toFixed(0)} ms (avec pauses d’interface).\n${annealing?'Fin du budget stochastique, sans garantie d’optimum global. ':''}${result.warnings.length?result.warnings.join(' '):'Critères numériques satisfaits ; pose à contrôler visuellement.'}`;
  notice('Localisation vectorielle terminée. Vérifier le résultat avant d’appliquer la pose.');
 }catch(e){notice(e.message,true);}finally{vectorLocRunning=false;updateVectorLocalisationStatus();}
};
$('vlCancel').onclick=()=>{vectorLocJob++;};
$('vlMethod').onchange=updateVectorLocalisationStatus;
$('vlApply').onclick=()=>{if(!vectorLocCurrent()){notice('Résultat vectoriel périmé : relancer.',true);updateVectorLocalisationStatus();return;}const r=vectorLocResult;r.scan.pose={...r.result.pose};r.scan.visible=true;state.selected=r.scan.id;$('viewMode').value='vectorPoints';renderCards();fit();notice('Pose appliquée au scan ; la carte vectorielle de référence reste inchangée.');};
$('vlExport').onclick=()=>{const r=vectorLocResult;if(r)download('localisation_vectorielle.json',JSON.stringify({...r.result,scan:{name:r.scan.name,checksum:r.scan.checksum},referenceMap:JSON.parse(r.mapText)},null,2),'application/json');};
$('vlDemo').onclick=()=>{
 if(vectorLocRunning){notice('Annuler la recherche vectorielle avant de charger l’exemple.',true);return;}
 const example=window.LIDAR_VECTOR_LOCALISATION_EXAMPLE;if(!example)return;
 const source=JSON.parse(JSON.stringify(example.scan));let scan=state.scans.find(s=>s.name===source.name&&s.checksum===source.checksum);
 if(!scan){add(source);scan=state.scans.find(s=>s.name===source.name&&s.checksum===source.checksum);}
 state.vector=LidarVector.VectorMap.load(JSON.stringify(example.map));vectorLocResult=null;
 state.scans.forEach(s=>{s.visible=s===scan;const ref=state.vector.scans.find(r=>r.name===s.name&&r.checksum===s.checksum);if(ref)s.pose={...ref.pose};});
 scan.pose={...example.initial};state.selected=scan.id;
 for(const[k,id]of Object.entries({x:'vlX',y:'vlY',theta:'vlTheta'}))$(id).value=String(example.initial[k]);
 const mapping={gap:'segGap',residual:'segResidual',minPoints:'segMinPoints',minLength:'segMinLength',angularDeg:'segAngleThreshold',positionM:'segDistanceThreshold',maxRange:'segRange',minIntensity:'segIntensity',clearance:'vecClearance',minCrossings:'vecCrossings',maxMisses:'vecMisses'};
 for(const[k,id]of Object.entries(mapping))$(id).value=String(state.vector.options[k]);$('vecCleanup').checked=state.vector.options.cleanup;
 $('viewMode').value='vectorPoints';renderCards();fit();updateVectorLocalisationStatus();
 $('vlReport').textContent='Carte construite avec quatre scans, scan test exclu. Les poses TP 1 sont une pseudo-référence, sans mesure physique indépendante.';
 notice('Exemple vectoriel chargé. La carte vectorielle précédente a été remplacée ; cliquer sur « Estimer ».');
};
updateVectorLocalisationStatus();
