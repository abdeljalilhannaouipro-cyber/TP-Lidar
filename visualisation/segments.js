(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LidarSegments=api;})(globalThis,function(){
 'use strict';
 const EPS=1e-9, ANGLE_EPS=1e-12;
 const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]],dot=(a,b)=>a[0]*b[0]+a[1]*b[1],cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
 const norm=v=>Math.hypot(...v),distance=(a,b)=>norm(sub(a,b));
 function point(p){if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))throw new Error('Un point doit contenir deux coordonnées finies en mètres.');return[...p];}
 function segment(a,b){return{a:point(a),b:point(b)};}
 function validate(s){if(!s)throw new Error('Segment manquant.');point(s.a);point(s.b);if(!Number.isFinite(distance(s.a,s.b)))throw new Error('Longueur de segment non finie.');return s;}
 function length(s){validate(s);return distance(s.a,s.b);}
 function direction(s){const len=length(s);if(len<=EPS)throw new Error('Segment dégénéré : direction indéfinie.');return sub(s.b,s.a).map(v=>v/len);}
 function at(s,t){return[s.a[0]+t*(s.b[0]-s.a[0]),s.a[1]+t*(s.b[1]-s.a[1])];}
 function angleDeg(s,t){const u=direction(s),v=direction(t);return Math.atan2(Math.abs(cross(u,v)),Math.abs(dot(u,v)))*180/Math.PI;}
 function endpointAngleDeg(s,t){const u=direction(s),v=direction(t);return Math.atan2(Math.abs(cross(u,v)),dot(u,v))*180/Math.PI;}
 function pointDistance(p,s){point(p);validate(s);const len=length(s);if(len<=EPS)return distance(p,s.a);const u=direction(s),along=Math.max(0,Math.min(len,dot(sub(p,s.a),u)));return distance(p,[s.a[0]+along*u[0],s.a[1]+along*u[1]]);}
 function intersection(s,t){
  validate(s);validate(t);const ls=length(s),lt=length(t);
  if(Math.min(ls,lt)<=EPS)return{kind:'degenerate',point:null};
  const u=direction(s),v=direction(t),delta=sub(t.a,s.a),den=cross(u,v);
  if(Math.abs(den)<=ANGLE_EPS){
   if(Math.abs(cross(delta,u))>EPS)return{kind:'parallel',point:null};
   const p=dot(delta,u),q=dot(sub(t.b,s.a),u),lo=Math.max(0,Math.min(p,q)),hi=Math.min(ls,Math.max(p,q));
   return{kind:'collinear',point:null,overlap:hi>=lo-EPS?[at(s,Math.max(0,Math.min(1,lo/ls))),at(s,Math.max(0,Math.min(1,hi/ls)))]:null};
  }
  const a=cross(delta,v)/den,b=cross(delta,u)/den;
  if(a< -EPS||a>ls+EPS||b< -EPS||b>lt+EPS)return{kind:'none',point:null};
  const clamped=Math.max(0,Math.min(ls,a));
  return{kind:'point',point:at(s,clamped/ls),alongA:clamped,alongB:Math.max(0,Math.min(lt,b))};
 }
 function separation(s,t){
  const hit=intersection(s,t);if(hit.point||(hit.kind==='collinear'&&hit.overlap))return 0;
  return Math.min(pointDistance(s.a,t),pointDistance(s.b,t),pointDistance(t.a,s),pointDistance(t.b,s));
 }
 function proximity(s,t,{angularDeg=8,positionM=.12}={}){
  if(!Number.isFinite(angularDeg)||angularDeg<0||angularDeg>90||!Number.isFinite(positionM)||positionM<0)throw new Error('Seuils attendus : angle 0–90° et distance positive ou nulle.');
  const angle=angleDeg(s,t),spatial=separation(s,t);
  return{close:angle<=angularDeg+1e-10&&spatial<=positionM+EPS,angleDeg:angle,distanceM:spatial,angularThresholdDeg:angularDeg,positionThresholdM:positionM};
 }
 function fit(points,hint){
  if(!Array.isArray(points)||points.length<2)throw new Error('Au moins deux points sont nécessaires.');points.forEach(point);
  const center=[0,0];for(const p of points){center[0]+=p[0]/points.length;center[1]+=p[1]/points.length;}
  let xx=0,yy=0,xy=0;for(const p of points){const x=p[0]-center[0],y=p[1]-center[1];xx+=x*x;yy+=y*y;xy+=x*y;}
  if(xx+yy<=EPS*EPS)throw new Error('Nuage dégénéré.');
  const angle=.5*Math.atan2(2*xy,xx-yy);let u=[Math.cos(angle),Math.sin(angle)];
  const orientation=hint||sub(points.at(-1),points[0]);if(dot(orientation,u)<0)u=u.map(v=>-v);
  let lo=Infinity,hi=-Infinity;for(const p of points){const t=dot(sub(p,center),u);lo=Math.min(lo,t);hi=Math.max(hi,t);}
  return segment([center[0]+lo*u[0],center[1]+lo*u[1]],[center[0]+hi*u[0],center[1]+hi*u[1]]);
 }
 function merge(s,t,options){if(!proximity(s,t,options).close)throw new Error('Fusion refusée : segments trop éloignés en angle ou en position.');return fit([s.a,s.b,t.a,t.b],sub(s.b,s.a));}
 function cutLongest(s,cutter){
  validate(s);validate(cutter);const unchanged=reason=>({segment:segment(s.a,s.b),changed:false,reason});
  const hit=intersection(s,cutter);
  if(hit.kind==='collinear')return unchanged('collinear');
  if(hit.kind==='degenerate')return unchanged('degenerate');
  if(!hit.point)return unchanged('no-intersection-on-both');
  const left=distance(s.a,hit.point),right=distance(hit.point,s.b);
  if(Math.min(left,right)<=EPS)return unchanged('target-endpoint');
  const tie=Math.abs(left-right)<=EPS,keepFirst=tie||left>right;
  return{segment:keepFirst?segment(s.a,hit.point):segment(hit.point,s.b),changed:true,reason:tie?'tie-keeps-first':keepFirst?'longest-first':'longest-second',
    intersection:[...hit.point],keptLength:keepFirst?left:right,discardedLength:keepFirst?right:left};
 }
 function extract(points,{gap=.30,residual=.05,minPoints=5,minLength=.15}={}){
  if(!Array.isArray(points)||points.length>100000)throw new Error('Nuage invalide ou trop grand (maximum 100 000 points).');points.forEach(point);
  if(![gap,residual,minLength].every(v=>Number.isFinite(v)&&v>EPS)||!Number.isInteger(minPoints)||minPoints<2)throw new Error('Seuils d’extraction positifs et au moins deux points requis.');
  const groups=[];let current=[];
  for(const p of points){if(current.length&&distance(p,current.at(-1))>gap){groups.push(current);current=[];}current.push(p);}if(current.length)groups.push(current);
  const result=[];
  for(const group of groups){
   const stack=[group];
   while(stack.length){
    const pts=stack.pop();if(pts.length<minPoints)continue;
    let s;try{s=fit(pts);}catch{continue;}if(length(s)<=EPS)continue;
    const u=direction(s),errors=pts.map(p=>Math.abs(cross(sub(p,s.a),u)));
    if(Math.max(...errors)<=residual){if(length(s)>=minLength)result.push({a:s.a,b:s.b,pointCount:pts.length,maxResidualM:Math.max(...errors)});continue;}
    // Each split strictly reduces both subsets. Short fragments are discarded.
    const chord=sub(pts.at(-1),pts[0]),chordLength=norm(chord);
    const splitErrors=chordLength>EPS?pts.map(p=>Math.abs(cross(sub(p,pts[0]),chord))/chordLength):errors;
    let k=1;for(let i=2;i<pts.length-1;i++)if(splitErrors[i]>splitErrors[k])k=i;
    if(pts.length<=2)continue;stack.push(pts.slice(k),pts.slice(0,k+1));
   }
  }
  return result;
 }
 function save(items){return JSON.stringify({format:'tp-lidar-segments-v1',units:'metres',linearToleranceM:EPS,parallelSinTolerance:ANGLE_EPS,items},null,2);}
 function load(text){
  const data=JSON.parse(text);if(data.format!=='tp-lidar-segments-v1'||data.units!=='metres'||!Array.isArray(data.items)||data.items.length>10000)throw new Error('Format de segments non reconnu.');
  return data.items.map((item,i)=>{
   validate(item.segment);if(length(item.segment)<=EPS)throw new Error('Segment importé dégénéré.');
   const sources=item.sources||[];if(!Array.isArray(sources)||sources.length>1000)throw new Error('Sources invalides.');
   for(const s of sources)if(typeof s.name!=='string'||typeof s.checksum!=='string'||!s.pose||![s.pose.x,s.pose.y,s.pose.theta].every(Number.isFinite))throw new Error('Pose de source invalide.');
   return{label:typeof item.label==='string'?item.label:`L${i+1}`,color:/^#[0-9a-f]{6}$/i.test(item.color||'')?item.color:'#155fa8',segment:segment(item.segment.a,item.segment.b),sources};
  });
 }
 function csv(items){const rows=['label,x1_m,y1_m,x2_m,y2_m,length_m'];for(const item of items){const name='"'+String(item.label||'').replace(/"/g,'""')+'"';rows.push([name,...item.segment.a,...item.segment.b,length(item.segment)].join(','));}return rows.join('\r\n');}
 return{EPS,ANGLE_EPS,segment,length,direction,angleDeg,endpointAngleDeg,pointDistance,intersection,separation,proximity,fit,merge,cutLongest,extract,save,load,csv};
});
