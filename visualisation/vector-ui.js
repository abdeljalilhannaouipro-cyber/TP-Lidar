'use strict';
function vectorOptionsFromFields(){return LidarVector.options({gap:segmentNumber('segGap'),residual:segmentNumber('segResidual'),minPoints:segmentNumber('segMinPoints'),minLength:segmentNumber('segMinLength'),angularDeg:segmentNumber('segAngleThreshold'),positionM:segmentNumber('segDistanceThreshold'),maxRange:segmentNumber('segRange'),minIntensity:segmentNumber('segIntensity'),cleanup:!!$('vecCleanup').checked,clearance:segmentNumber('vecClearance'),minCrossings:segmentNumber('vecCrossings'),maxMisses:segmentNumber('vecMisses')});}
function updateVectorStatus(){
  const map=state.vector,selected=state.scans.find(s=>s.id===state.selected);
  $('vecSelected').disabled=!selected;$('vecSelected').textContent=selected?`Intégrer ${selected.label}`:'Intégrer le scan sélectionné';$('vecSelected').title=selected?.name||'';
  $('vecVisible').disabled=!state.scans.some(s=>s.visible);$('vecSeed').disabled=!state.segments.length;
  for(const id of ['vecSave','vecCSV'])$(id).disabled=!map;$('vecToWorkshop').disabled=!map?.features.length;
  if(!map){$('vecStatus').textContent='Carte vide. Régler les poses avant d’intégrer les scans.';return;}
  const stats=map.stats();let stale=0;
  for(const record of map.scans){const s=state.scans.find(s=>s.name===record.name&&s.checksum===record.checksum);if(s&&['x','y','theta'].some(k=>record.pose[k]!==s.pose[k]))stale++;}
  $('vecStatus').textContent=`${stats.features} primitives · ${stats.scans} scans intégrés · ${stats.confirmed} confirmées · ${stats.contradicted} contradites · ${stats.totalLengthM.toFixed(2)} m de segments.${stale?' ATTENTION : '+stale+' pose(s) modifiée(s) ; reconstruire la carte.':''}`;
}
function drawVectorMap(){
  for(const feature of state.vector.features){
    const p=screen(feature.segment.a),q=screen(feature.segment.b);
    ctx.strokeStyle=feature.misses>0?'#c26b08':feature.supportScans.length>=2?'#008468':'#8c3f9b';ctx.lineWidth=feature.supportScans.length>=2?3:2;
    ctx.beginPath();ctx.moveTo(...p);ctx.lineTo(...q);ctx.stroke();
    if(state.view.scale>60){ctx.fillStyle=ctx.strokeStyle;ctx.font='10px Segoe UI,Arial';ctx.fillText(`V${feature.id}`,(p[0]+q[0])/2+4,(p[1]+q[1])/2-5);}
  }
}
function integrateVectorScans(scans){
  try{
    if(!scans.length)throw new Error('Charger et sélectionner un scan.');
    const chosen=vectorOptionsFromFields();
    if(state.vector&&JSON.stringify(chosen)!==JSON.stringify(state.vector.options))throw new Error('Paramètres modifiés : recréer la carte pour les appliquer.');
    const next=state.vector?LidarVector.VectorMap.load(state.vector.save()):new LidarVector.VectorMap(chosen);
    const results=scans.map(scan=>next.integrate(scan)),added=results.filter(r=>!r.duplicate);
    state.vector=next;$('viewMode').value='vector';fit();
    const total=key=>added.reduce((n,r)=>n+r[key],0);
    $('vecReport').textContent=`${added.length} scan(s) ajouté(s), ${results.length-added.length} doublon(s) ignoré(s). Extraction : ${total('extracted')} segments. Fusions : ${total('merges')}. Réductions : ${total('trimmed')}. Retraits : ${total('removed')}.`;
    notice('Carte vectorielle mise à jour dans le repère des poses fournies. Les réglages et les poses sont conservés dans le JSON.');
  }catch(error){notice(error.message,true);}
}
$('vecNew').onclick=()=>{try{state.vector=new LidarVector.VectorMap(vectorOptionsFromFields());$('viewMode').value='vector';$('vecReport').textContent='Nouvelle carte vide.';draw();notice('Carte vectorielle créée. Intégrer les scans un par un ou les scans visibles.');}catch(error){notice(error.message,true);}};
$('vecSeed').onclick=()=>{try{const next=new LidarVector.VectorMap(vectorOptionsFromFields());next.seed(state.segments.map(item=>item.segment));state.vector=next;$('viewMode').value='vector';$('vecReport').textContent='Segments de l’atelier copiés comme géométrie initiale, sans observation de scan enregistrée.';fit();}catch(error){notice(error.message,true);}};
$('vecSelected').onclick=()=>integrateVectorScans(state.scans.filter(s=>s.id===state.selected));
$('vecVisible').onclick=()=>integrateVectorScans(state.scans.filter(s=>s.visible));
$('vecSave').onclick=()=>{if(state.vector)download('carte_vectorielle.json',state.vector.save(),'application/json');};
$('vecCSV').onclick=()=>{if(state.vector)download('carte_vectorielle.csv',state.vector.csv(),'text/csv;charset=utf-8');};
$('vecLoad').onclick=()=>$('vecFile').click();
$('vecFile').onchange=async event=>{
  try{const file=event.target.files[0];if(!file)return;const map=LidarVector.VectorMap.load(await file.text());
    const mapping={gap:'segGap',residual:'segResidual',minPoints:'segMinPoints',minLength:'segMinLength',angularDeg:'segAngleThreshold',positionM:'segDistanceThreshold',maxRange:'segRange',minIntensity:'segIntensity',clearance:'vecClearance',minCrossings:'vecCrossings',maxMisses:'vecMisses'};
    for(const[key,id]of Object.entries(mapping))$(id).value=String(map.options[key]);$('vecCleanup').checked=map.options.cleanup;
    state.vector=map;$('viewMode').value='vector';$('vecReport').textContent='Carte rechargée avec son historique. Ajouter seulement de nouveaux scans dans le même repère.';fit();notice('Carte vectorielle rechargée.');
  }catch(error){notice(error.message,true);}finally{event.target.value='';}
};
$('vecToWorkshop').onclick=()=>{if(!state.vector)return;segmentCheckpoint();state.segments=state.vector.features.map(f=>newSegmentItem(f.segment,`V${f.id}`,f.misses?'#c26b08':f.supportScans.length>=2?'#008468':'#8c3f9b',f.supportScans.map(index=>{const r=state.vector.scans[index-1];return{name:r.name,checksum:r.checksum,pose:{...r.pose}};})));refreshSegmentSelectors();$('viewMode').value='segments';fit();notice('Copie dans l’atelier. Les manipulations de cette copie ne modifient pas la carte vectorielle.');};
draw();
