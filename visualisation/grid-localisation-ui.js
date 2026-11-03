'use strict';
let localisationJob=0,localisationRunning=false,localisationResult=null;
if(!['exhaustive','multilevel','gradient','pyramid','annealing'].includes($('locMethod').value))$('locMethod').value='exhaustive';
function localisationNumber(id){const e=$(id);if(!e.value.trim()||!Number.isFinite(Number(e.value)))throw new Error('Champ de localisation invalide.');return Number(e.value);}
function localisationCurrent(){
 const r=localisationResult;if(!r)return false;
 return state.grid===r.grid&&state.grid.version===r.version&&state.selected===r.scan.id&&state.scans.includes(r.scan)&&r.scan.checksum===r.checksum&&['x','y','theta'].every(k=>r.scan.pose[k]===r.originalPose[k]);
}
function updateLocalisationStatus(){
 const scan=state.scans.find(s=>s.id===state.selected);
 $('locRun').disabled=localisationRunning||!scan||!state.grid;
 $('locCancel').disabled=!localisationRunning;
 $('locUsePose').disabled=!scan||localisationRunning;
 $('locApply').disabled=localisationRunning||!localisationCurrent();
 $('locExport').disabled=!localisationResult;
 for(const id of ['locMethod','locStepXY','locStepAngle'])$(id).disabled=localisationRunning||(id!=='locMethod'&&$('locMethod').value!=='exhaustive');
 $('locIterations').disabled=localisationRunning||$('locMethod').value!=='gradient';
 for(const id of ['locChains','locAnnealIterations','locSeed'])$(id).disabled=localisationRunning||$('locMethod').value!=='annealing';
 $('locTarget').textContent=scan?`Scan sélectionné : ${scan.name}`:'Sélectionner un scan indépendant de la grille.';
}
function localisationDisplay(result){
 const p=result.pose;
 const titles={gradient:'Descente de gradient',pyramid:'Multi-résolution : pyramide de grilles',annealing:'Probabiliste : recuit simulé'};
 const title=titles[result.method]||(result.complete?'Recherche exhaustive terminée':'Recherche à trois niveaux');
 const stops={small_gradient:'gradient faible',small_update:'variation devenue faible',line_search_stalled:'aucun pas de descente accepté',iteration_limit:'budget maximal atteint'};
 const details=result.method==='gradient'?`\n${result.iterations} itérations ; arrêt : ${stops[result.stopReason]||result.stopReason}.`:result.method==='annealing'?`\nGraine ${result.seed} ; ${result.acceptedMoves}/${result.attemptedMoves} déplacements acceptés.`:result.method==='pyramid'?`\nRésolutions : ${result.levels.map(l=>l.resolution.toFixed(2)+' m').join(' → ')}.`:'';
 $('locReport').textContent=`${title}\nPose proposée : x=${p.x.toFixed(3)} m ; y=${p.y.toFixed(3)} m ; θ=${p.theta.toFixed(2)}°\nScore diagnostic : ${result.before.score.toFixed(3)} → ${result.after.score.toFixed(3)} ; couverture connue : ${(result.after.coverage*100).toFixed(1)} %\n${result.tested} évaluations${result.complete?' sur '+result.totalCandidates+' poses prévues':''} ; ${result.elapsedMs.toFixed(0)} ms (inclut les pauses de l’interface).${details}\n${result.warnings.length?result.warnings.join(' '):'Critères numériques satisfaits ; pose à contrôler visuellement.'}`;
}
$('locUsePose').onclick=()=>{
 const scan=state.scans.find(s=>s.id===state.selected);if(!scan)return;
 for(const[k,id]of Object.entries({x:'locX',y:'locY',theta:'locTheta'}))$(id).value=String(scan.pose[k]);
 notice('Pose du scan copiée comme point de départ de la recherche locale.');
};
$('locRun').onclick=async()=>{
 const job=++localisationJob;
 try{
  const scan=state.scans.find(s=>s.id===state.selected),grid=state.grid;
  if(!scan||!grid)throw new Error('Charger une grille et sélectionner un scan.');
  const initial={x:localisationNumber('locX'),y:localisationNumber('locY'),theta:localisationNumber('locTheta')};
  const options={windowXY:localisationNumber('locXY'),windowTheta:localisationNumber('locAngle'),maxRange:localisationNumber('locRange'),minIntensity:localisationNumber('locIntensity')};
  const exhaustive=$('locMethod').value==='exhaustive';
  const method=$('locMethod').value;
  if(exhaustive){options.stepXY=localisationNumber('locStepXY');options.stepTheta=localisationNumber('locStepAngle');}
  if(['gradient','pyramid','annealing'].includes(method))options.method=method;
  if(method==='gradient')options.maxIterations=localisationNumber('locIterations');
  if(method==='annealing'){options.chains=localisationNumber('locChains');options.annealIterations=localisationNumber('locAnnealIterations');options.seed=localisationNumber('locSeed');}
  const originalPose={...scan.pose},version=grid.version,checksum=scan.checksum;
  localisationRunning=true;localisationResult=null;updateLocalisationStatus();
  const engine=exhaustive?LidarGridBruteForce:method==='multilevel'?LidarGridLocalisation:LidarGridOptimisation;
  const result=await engine.matchAsync(grid,scan,initial,options,p=>{$('locReport').textContent=exhaustive?`Recherche exhaustive : ${p.tested} / ${p.total} poses testées…`:method==='gradient'?`Descente de gradient : itération ${p.iteration} ; ${p.tested} évaluations…`:method==='annealing'?`Recuit : chaîne ${p.chain}/${p.chains}, itération ${p.iteration} ; ${p.tested} évaluations…`:`Recherche au niveau ${p.level}/3 : ${p.tested} poses testées…`;},()=>job!==localisationJob);
  const saved={grid,version,scan,checksum,originalPose,result};localisationResult=saved;
  if(!localisationCurrent()){localisationResult=null;throw new Error('Carte ou scan modifié pendant la recherche : relancer.');}
  localisationDisplay(result);notice('Recherche terminée. Vérifier les indicateurs puis appliquer la pose si elle convient.');
 }catch(error){notice(error.message,true);}finally{localisationRunning=false;updateLocalisationStatus();}
};
$('locCancel').onclick=()=>{localisationJob++;};
$('locMethod').onchange=updateLocalisationStatus;
$('locApply').onclick=()=>{
 if(!localisationCurrent()){notice('Résultat périmé : relancer la localisation.',true);updateLocalisationStatus();return;}
 const r=localisationResult;r.scan.pose={...r.result.pose};r.scan.visible=true;state.selected=r.scan.id;
 $('viewMode').value='both';renderCards();fit();updateLocalisationStatus();
 notice('Pose proposée appliquée au scan. La grille de référence reste inchangée.');
};
$('locExport').onclick=()=>{
 const r=localisationResult;if(!r)return;
 download('localisation_grid.json',JSON.stringify({...r.result,scan:{name:r.scan.name,checksum:r.checksum},referenceScans:r.grid.scans,resultStillApplicable:localisationCurrent()},null,2),'application/json');
};
$('locDemo').onclick=()=>{
 if(localisationRunning){notice('Annuler la recherche avant de charger l’exemple.',true);return;}
 const example=window.LIDAR_GRID_LOCALISATION_EXAMPLE;if(!example)return;
 const source=JSON.parse(JSON.stringify(example.scan));
 let scan=state.scans.find(s=>s.name===source.name&&s.checksum===source.checksum);
 if(!scan){add(source);scan=state.scans.find(s=>s.name===source.name&&s.checksum===source.checksum);}
 state.scans.forEach(s=>{s.visible=s===scan;});scan.pose={...example.initial};state.selected=scan.id;
 state.grid=LidarGrid.Grid.load(JSON.stringify(example.grid));localisationResult=null;
 const grid=state.grid;
 for(const[id,value]of Object.entries({gridResolution:grid.resolution,gridWidth:grid.width,gridHeight:grid.height,gridX:grid.x,gridY:grid.y}))$(id).value=String(value);
 for(const[k,id]of Object.entries({x:'locX',y:'locY',theta:'locTheta'}))$(id).value=String(example.initial[k]);
 $('viewMode').value='both';renderCards();fit();updateLocalisationStatus();
 $('locReport').textContent='Exemple réel : grille de quatre scans, cinquième scan exclu de la construction. Pose initiale perturbée. Les poses du TP 1 restent une pseudo-référence.';
 notice('Exemple chargé : cliquer sur « Estimer la pose », puis sur « Appliquer ». La grille précédente a été remplacée.');
};
updateLocalisationStatus();
