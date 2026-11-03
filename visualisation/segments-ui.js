'use strict';
const Seg=window.LidarSegments;
state.segmentCounter=0;state.segmentHistory=[];state.segmentIntersection=null;
function segmentCheckpoint(){state.segmentHistory.push(JSON.stringify({items:state.segments,counter:state.segmentCounter,a:$('segA').value,b:$('segB').value}));if(state.segmentHistory.length>20)state.segmentHistory.shift();}
function newSegmentItem(segment,label,color='#155fa8',sources=[]){return{id:++state.segmentCounter,label,color,segment:Seg.segment(segment.a,segment.b),sources};}
function segmentNumber(id){if(!$(id).value.trim()||!Number.isFinite(Number($(id).value)))throw new Error('Compléter les paramètres numériques des segments.');return Number($(id).value);}
function segmentThresholds(){return{angularDeg:segmentNumber('segAngleThreshold'),positionM:segmentNumber('segDistanceThreshold')};}
function segmentPair(){const a=state.segments.find(s=>String(s.id)===$('segA').value),b=state.segments.find(s=>String(s.id)===$('segB').value);if(!a||!b||a===b)throw new Error('Choisir deux segments distincts A et B.');return[a,b];}
function refreshSegmentSelectors(a=$('segA').value,b=$('segB').value){
  for(const id of ['segA','segB']){
    const select=$(id);select.replaceChildren();
    for(const item of state.segments){const option=document.createElement('option');option.value=String(item.id);option.textContent=`${item.label} · ${Seg.length(item.segment).toFixed(3)} m`;select.append(option);}
  }
  $('segA').value=state.segments.some(s=>String(s.id)===String(a))?String(a):String(state.segments[0]?.id||'');
  $('segB').value=state.segments.some(s=>String(s.id)===String(b))?String(b):String(state.segments[1]?.id||'');
  if($('segA').value===$('segB').value&&state.segments.length>1)$('segB').value=String(state.segments.find(s=>String(s.id)!==$('segA').value).id);
  state.segmentIntersection=null;
}
function updateSegmentsStatus(){
  const n=state.segments.length;
  for(const id of ['segAnalyze','segMerge','segCut'])$(id).disabled=n<2;
  for(const id of ['segSave','segCSV'])$(id).disabled=!n;
  $('segUndo').disabled=!state.segmentHistory.length;
  const scan=state.scans.find(s=>s.id===state.selected);
  $('segExtractSelected').disabled=!scan;$('segExtractSelected').textContent=scan?`Extraire de ${scan.label}`:'Extraire du scan sélectionné';
  $('segExtractVisible').disabled=!state.scans.some(s=>s.visible);
  let stale=0;for(const item of state.segments)if(item.sources.some(source=>{const loaded=state.scans.find(s=>s.name===source.name&&s.checksum===source.checksum);return loaded&&['x','y','theta'].some(k=>loaded.pose[k]!==source.pose[k]);}))stale++;
  $('segStatus').textContent=`${n} segment(s). Tolérance : ${Seg.EPS} m ; parallélisme : |sin(angle)| ≤ ${Seg.ANGLE_EPS}.${stale?' ATTENTION : '+stale+' segment(s) issu(s) de poses modifiées. Réextraire avant de les comparer aux scans.':''}`;
}
function drawSegments(){
  const a=$('segA').value,b=$('segB').value;
  for(const item of state.segments){
    const isA=String(item.id)===a,isB=String(item.id)===b;
    ctx.strokeStyle=isA?'#d94b35':isB?'#226dc2':item.color;ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=isA||isB?3.5:2.2;
    const p=screen(item.segment.a),q=screen(item.segment.b);
    ctx.beginPath();ctx.moveTo(...p);ctx.lineTo(...q);ctx.stroke();
    if(isA||isB){
      ctx.beginPath();ctx.arc(...p,4,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(...q,4,0,Math.PI*2);ctx.stroke();
      ctx.font='bold 12px Segoe UI,Arial';ctx.fillText(`${isA?'A':'B'} · ${item.label}`,p[0]+7,p[1]-8);
      ctx.font='10px Segoe UI,Arial';ctx.fillText('a',p[0]+5,p[1]+15);ctx.fillText('b',q[0]+5,q[1]+15);
    }
  }
  if(state.segmentIntersection){const p=screen(state.segmentIntersection);ctx.strokeStyle='#933b95';ctx.lineWidth=2;ctx.beginPath();ctx.arc(...p,7,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#933b95';ctx.font='12px Segoe UI,Arial';ctx.fillText('Intersection',p[0]+10,p[1]+18);}
}
function extractSegments(scans){
  try{
    if(!scans.length)throw new Error('Charger et sélectionner un scan.');
    const options={gap:segmentNumber('segGap'),residual:segmentNumber('segResidual'),minPoints:segmentNumber('segMinPoints'),minLength:segmentNumber('segMinLength')};
    const maxRange=segmentNumber('segRange'),intensity=segmentNumber('segIntensity');
    if(maxRange<=0||intensity<0||intensity>255)throw new Error('Portée positive et intensité de 0 à 255 attendues.');
    const prepared=[];let filtered=0;
    for(const scan of scans){
      const cloud=[];
      for(let i=0;i<scan.points.length;i++){
        if(Math.hypot(...scan.points[i])>maxRange||(intensity>0&&(!Number.isFinite(scan.qualities?.[i])||scan.qualities[i]<intensity))){filtered++;continue;}
        cloud.push(Core.transform(scan.points[i],scan.pose));
      }
      const sources=[{name:scan.name,checksum:scan.checksum,pose:{...scan.pose}}];
      Seg.extract(cloud,options).forEach((segment,i)=>prepared.push({segment,label:`${scan.label} · L${i+1}`,color:scan.color,sources}));
    }
    if(prepared.length>10000)throw new Error('Trop de segments : augmenter les seuils de filtrage.');
    segmentCheckpoint();state.segments=prepared.map(item=>newSegmentItem(item.segment,item.label,item.color,item.sources));
    refreshSegmentSelectors();$('viewMode').value='segmentsPoints';fit();
    $('segResult').textContent=`${prepared.length} segment(s) extrait(s), ${filtered} point(s) filtré(s) en plus des distances invalides déjà exclues.`;
    notice('Extraction effectuée dans le repère des poses actuelles. Choisir A et B pour les manipuler.');
  }catch(error){notice(error.message,true);}
}
function analyzeSegments(){
  try{
    const[a,b]=segmentPair(),p=Seg.proximity(a.segment,b.segment,segmentThresholds()),hit=Seg.intersection(a.segment,b.segment);
    state.segmentIntersection=hit.point;
    const intersection=hit.point?`(${hit.point.map(v=>v.toFixed(6)).join(', ')}) m`:hit.kind==='collinear'?'supports colinéaires : pas de point unique':hit.kind==='parallel'?'supports parallèles':hit.kind==='degenerate'?'segment dégénéré':'aucune sur les deux segments';
    $('segResult').textContent=`Angle des supports : ${p.angleDeg.toFixed(4)}°\nAngle des directions a→b : ${Seg.endpointAngleDeg(a.segment,b.segment).toFixed(4)}°\nDistance minimale : ${p.distanceM.toFixed(6)} m\nProches en angle ET en position : ${p.close?'OUI':'NON'}\nIntersection : ${intersection}`;
    draw();
  }catch(error){notice(error.message,true);}
}
$('segExtractSelected').onclick=()=>extractSegments(state.scans.filter(s=>s.id===state.selected));
$('segExtractVisible').onclick=()=>extractSegments(state.scans.filter(s=>s.visible));
$('segAnalyze').onclick=analyzeSegments;
for(const id of ['segA','segB'])$(id).onchange=()=>{state.segmentIntersection=null;$('segResult').textContent='Sélection modifiée : relancer l’analyse.';draw();};
$('segMerge').onclick=()=>{
  try{const[a,b]=segmentPair(),geometry=Seg.merge(a.segment,b.segment,segmentThresholds());
    const sources=[...a.sources,...b.sources].filter((s,i,list)=>list.findIndex(t=>t.name===s.name&&t.checksum===s.checksum&&['x','y','theta'].every(k=>s.pose[k]===t.pose[k]))===i);
    segmentCheckpoint();const merged=newSegmentItem(geometry,`Fusion ${a.label} + ${b.label}`,'#8c3f9b',sources);
    state.segments=state.segments.filter(s=>s!==a&&s!==b);state.segments.push(merged);refreshSegmentSelectors(merged.id);$('segResult').textContent=`Fusion effectuée : longueur ${Seg.length(geometry).toFixed(6)} m.`;draw();
  }catch(error){notice(error.message,true);}
};
$('segCut').onclick=()=>{
  try{const[a,b]=segmentPair(),result=Seg.cutLongest(a.segment,b.segment);
    const reasons={'collinear':'Supports colinéaires : aucun découpage.','degenerate':'Segment dégénéré : aucun découpage.','no-intersection-on-both':'Pas d’intersection appartenant aux deux segments : aucun découpage.','target-endpoint':'Intersection à une extrémité de A (à la tolérance près) : aucun changement.'};
    if(!result.changed){$('segResult').textContent=reasons[result.reason]||result.reason;draw();return;}
    segmentCheckpoint();a.segment=result.segment;refreshSegmentSelectors(a.id,b.id);state.segmentIntersection=result.intersection;
    $('segResult').textContent=`A découpé ; B inchangé. Côté conservé : ${result.keptLength.toFixed(9)} m.\n${result.reason==='tie-keeps-first'?'Longueurs égales à 1e-9 m près : côté contenant le premier point a conservé.':'Le côté le plus long est conservé.'}`;draw();
  }catch(error){notice(error.message,true);}
};
$('segAdd').onclick=()=>{
  try{const geometry=Seg.segment([segmentNumber('segX1'),segmentNumber('segY1')],[segmentNumber('segX2'),segmentNumber('segY2')]);if(Seg.length(geometry)<=Seg.EPS)throw new Error('Les deux extrémités doivent être distinctes.');
    segmentCheckpoint();const item=newSegmentItem(geometry,`Manuel ${state.segmentCounter+1}`,'#425d78');state.segments.push(item);refreshSegmentSelectors(item.id);$('viewMode').value='segments';fit();
  }catch(error){notice(error.message,true);}
};
$('segDemo').onclick=()=>{
  const cases={cross:[[[0,0],[4,0]],[[1,-1],[1,1]]],tie:[[[0,0],[4,0]],[[2,-1],[2,1]]],endpoint:[[[0,0],[4,0]],[[4,-1],[4,1]]],outsideB:[[[0,0],[4,0]],[[1,1],[1,2]]],collinear:[[[0,0],[4,0]],[[1,0],[3,0]]],cutterEndpoint:[[[0,0],[4,0]],[[1,0],[1,1]]],merge:[[[0,0],[2,0]],[[2.05,.04],[4,.04]]]};
  const chosen=cases[$('segCase').value];if(!chosen)return;
  segmentCheckpoint();state.segments=chosen.map((coords,i)=>newSegmentItem(Seg.segment(...coords),`Exemple ${i?'B':'A'}`,i?'#226dc2':'#d94b35'));
  refreshSegmentSelectors();$('viewMode').value='segments';fit();analyzeSegments();notice('Exemple géométrique synthétique, distinct des mesures réelles. Tester le découpage ou la fusion.');
};
$('segUndo').onclick=()=>{const saved=state.segmentHistory.pop();if(!saved)return;const data=JSON.parse(saved);state.segments=data.items;state.segmentCounter=data.counter;refreshSegmentSelectors(data.a,data.b);$('segResult').textContent='Dernière modification des segments annulée.';draw();};
$('segSave').onclick=()=>download('segments.json',Seg.save(state.segments),'application/json');
$('segCSV').onclick=()=>download('segments.csv',Seg.csv(state.segments),'text/csv;charset=utf-8');
$('segLoad').onclick=()=>$('segFile').click();
$('segFile').onchange=async event=>{
  try{const file=event.target.files[0];if(!file)return;const items=Seg.load(await file.text());segmentCheckpoint();state.segments=items.map(item=>newSegmentItem(item.segment,item.label,item.color,item.sources));refreshSegmentSelectors();$('viewMode').value='segments';fit();notice(`${items.length} segment(s) rechargé(s).`);}
  catch(error){notice(error.message,true);}finally{event.target.value='';}
};
refreshSegmentSelectors();draw();
