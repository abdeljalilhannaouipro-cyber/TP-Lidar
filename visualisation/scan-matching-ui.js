'use strict';
let scanMatchJob=0,scanMatchRunning=false,scanMatchResult=null,scanMatchOptionsKey='';
if(!LidarScanMatching.METHODS.includes($('s2Method').value))$('s2Method').value='multiresolution';
function scanMatchNumber(id){const value=String($(id).value);if(!value.trim()||!Number.isFinite(Number(value)))throw new Error('Champ entre scans invalide.');return Number(value);}
function scanMatchCurrent(){const r=scanMatchResult;return !!r&&state.scans.includes(r.reference)&&state.scans.includes(r.query)&&state.selected===r.query.id&&$('s2Ref').value===String(r.reference.id)&&r.reference.checksum===r.referenceChecksum&&r.query.checksum===r.queryChecksum&&['x','y','theta'].every(k=>r.reference.pose[k]===r.referencePose[k]&&r.query.pose[k]===r.queryPose[k]);}
function updateScanMatchingStatus(){
 const key=state.scans.map(s=>`${s.id}:${s.name}`).join('|');
 if(key!==scanMatchOptionsKey){const current=$('s2Ref').value;const options=state.scans.map(s=>{const e=document.createElement('option');e.value=String(s.id);e.textContent=`${s.label} · ${s.name}`;return e;});$('s2Ref').replaceChildren(...options);$('s2Ref').value=state.scans.some(s=>String(s.id)===current)?current:String(state.scans[0]?.id??'');scanMatchOptionsKey=key;}
 const reference=state.scans.find(s=>String(s.id)===$('s2Ref').value),query=state.scans.find(s=>s.id===state.selected);
 $('s2Run').disabled=scanMatchRunning||!reference||!query||reference===query;$('s2Copy').disabled=scanMatchRunning||!reference||!query||reference===query;
 $('s2Cancel').disabled=!scanMatchRunning;$('s2Apply').disabled=scanMatchRunning||!scanMatchCurrent();$('s2Export').disabled=!scanMatchResult;
 for(const id of ['s2Ref','s2Method'])$(id).disabled=scanMatchRunning;
 $('s2Target').textContent=query?`Scan à localiser : ${query.label} · ${query.name}`:'Sélectionner le scan à localiser dans les cartes de scans.';
}
$('s2Ref').onchange=updateScanMatchingStatus;
$('s2Copy').onclick=()=>{const ref=state.scans.find(s=>String(s.id)===$('s2Ref').value),q=state.scans.find(s=>s.id===state.selected);if(!ref||!q)return;const p=LidarScanMatching.relative(ref.pose,q.pose);for(const[k,id]of Object.entries({x:'s2X',y:'s2Y',theta:'s2Theta'}))$(id).value=String(p[k]);notice('Pose relative affichée copiée comme initialisation ; elle n’est pas une mesure indépendante.');};
$('s2Run').onclick=async()=>{
 const job=++scanMatchJob;
 try{
  const reference=state.scans.find(s=>String(s.id)===$('s2Ref').value),query=state.scans.find(s=>s.id===state.selected);if(!reference||!query)throw new Error('Charger et sélectionner deux scans.');
  const initial={x:scanMatchNumber('s2X'),y:scanMatchNumber('s2Y'),theta:scanMatchNumber('s2Theta')},method=$('s2Method').value;
  const options={method,windowXY:scanMatchNumber('s2XY'),windowTheta:scanMatchNumber('s2Angle'),voxelM:scanMatchNumber('s2Voxel'),maxRange:12,capM:.5};
  const referencePose={...reference.pose},queryPose={...query.pose},referenceChecksum=reference.checksum,queryChecksum=query.checksum;
  scanMatchResult=null;scanMatchRunning=true;updateScanMatchingStatus();
  const result=await LidarScanMatching.matchAsync(reference,query,initial,options,p=>{$('s2Report').textContent=method==='direct'?`Calcul direct : ${p.pairs} correspondances…`:method==='gradient'?`Gradient : itération ${p.iteration}…`:method==='multiresolution'?`Multi-résolution : niveau ${p.level}/3…`:method==='annealing'?`Recuit : chaîne ${p.chain}, tentative ${p.iteration}…`:`Exhaustif : ${p.tested}/${p.total} poses…`;},()=>job!==scanMatchJob);
  scanMatchResult={reference,query,referencePose,queryPose,referenceChecksum,queryChecksum,result};
  if(!scanMatchCurrent()){scanMatchResult=null;throw new Error('Scan, référence ou pose modifié : relancer.');}
  const p=result.pose;
  $('s2Report').textContent=`Pose du scan dans le repère du scan de référence :\nx=${p.x.toFixed(3)} m ; y=${p.y.toFixed(3)} m ; θ=${p.theta.toFixed(2)}°\nCoût : ${result.before.cost.toFixed(4)} → ${result.after.cost.toFixed(4)} m²\nVoisins à 20 cm : ${(100*result.after.nearFraction).toFixed(1)} % / ${(100*result.reverse.nearFraction).toFixed(1)} % (deux sens)\n${result.referencePoints} / ${result.queryPoints} points traités ; ${result.elapsedMs.toFixed(0)} ms (avec pauses).\n${result.warnings.length?result.warnings.join(' '):'Pose à vérifier ; aucun score ne certifie sa précision physique.'}`;
  notice('Localisation entre scans calculée. Appliquer déplace uniquement le scan à localiser.');
 }catch(e){notice(e.message,true);}finally{scanMatchRunning=false;updateScanMatchingStatus();}
};
$('s2Cancel').onclick=()=>{scanMatchJob++;};
$('s2Apply').onclick=()=>{if(!scanMatchCurrent()){notice('Résultat entre scans périmé : relancer.',true);updateScanMatchingStatus();return;}const r=scanMatchResult;r.query.pose=LidarScanMatching.compose(r.referencePose,r.result.pose);r.query.visible=true;r.reference.visible=true;$('viewMode').value='points';renderCards();fit();notice('Pose relative appliquée dans le repère courant de la référence. Le scan de référence reste fixe.');};
$('s2Export').onclick=()=>{const r=scanMatchResult;if(r)download('localisation_entre_scans.json',JSON.stringify({...r.result,reference:{name:r.reference.name,checksum:r.referenceChecksum,displayPose:r.referencePose},query:{name:r.query.name,checksum:r.queryChecksum,displayPoseBefore:r.queryPose}},null,2),'application/json');};
function loadScanMatchingExample(example,physical=false){
 if(scanMatchRunning){notice('Annuler le calcul entre scans avant de charger l’exemple.',true);return;}
 if(!example)return;
 const get=data=>{let s=state.scans.find(s=>s.name===data.name&&s.checksum===data.checksum);if(!s){add(JSON.parse(JSON.stringify(data)));s=state.scans.find(s=>s.name===data.name&&s.checksum===data.checksum);}return s;};
 const reference=get(example.reference),query=get(example.query);reference.pose={x:0,y:0,theta:0};query.pose={...example.initial};state.scans.forEach(s=>{s.visible=s===reference||s===query;});state.selected=query.id;scanMatchResult=null;
 updateScanMatchingStatus();$('s2Ref').value=String(reference.id);
 for(const[k,id]of Object.entries({x:'s2X',y:'s2Y',theta:'s2Theta'}))$(id).value=String(example.initial[k]);
 $('viewMode').value='points';renderCards();fit();updateScanMatchingStatus();
 $('s2Report').textContent=physical?'Captures A/B : +50 cm selon X, sans rotation, déclarés par l’opérateur. Mètre gradué à 1 cm ; incertitude totale de placement et d’orientation inconnue.':'Deux acquisitions réelles distinctes. Proximité et pose relative estimées au TP 1 ; incertitude physique non mesurée.';
 notice('Exemple entre scans chargé : choisir une méthode puis estimer. Les autres scans sont conservés et masqués.');
}
$('s2Demo').onclick=()=>loadScanMatchingExample(window.LIDAR_SCAN_MATCHING_EXAMPLE);
$('s2MeasuredDemo').onclick=()=>loadScanMatchingExample(window.LIDAR_SCAN_MATCHING_MEASURED_EXAMPLE,true);
updateScanMatchingStatus();
