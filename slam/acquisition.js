(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('../visualisation/core.js'));else root.LidarSlamAcquisition=factory(root.LidarCore);})(globalThis,function(C){
 'use strict';
 function checkAngles(angles){
  if(angles.length<100||angles.length>1000||angles.some(a=>!Number.isFinite(a)||a<0||a>=360))throw Error('Tour lidar invalide : angles ou nombre de points.');
  let span=0,direction=0;
  // The bundled LD06 library emits decreasing angles. Also accept increasing
  // angles, but never a reversal or two rotations in the same frame.
  for(let i=1;i<angles.length;i++){
   const delta=((angles[i]-angles[i-1]+540)%360)-180;
   if(Math.abs(delta)>5)throw Error('Tour interrompu ou ordre angulaire invalide.');
   if(delta!==0){if(direction&&Math.sign(delta)!==direction)throw Error('Inversion du sens angulaire dans un tour.');direction=Math.sign(delta);}
   span+=Math.abs(delta);
  }
  if(span<350||span>360.5)throw Error('Tour incomplet ou plusieurs rotations dans un bloc.');return span;
 }
 function binary(input,name='scan_wifi.csv'){
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input),d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(d.byteLength<8)throw Error('Trame Wi-Fi tronquée.');
  const count=d.getUint16(6,true);if(count<100||count>460||d.byteLength!==8+5*count)throw Error('Taille de trame ou nombre de points invalide.');
  const angles=[],rows=['point_index,angle_deg,dist_mm,intensity'];
  for(let i=0;i<count;i++){const p=8+5*i,a=d.getUint16(p,true)/100;angles.push(a);rows.push([i,a,d.getUint16(p+2,true),d.getUint8(p+4)].join(','));}
  const span=checkAngles(angles),csv=rows.join('\n'),scan=C.parseScan(csv,name);
  return{scan,csv,span,receivedPoints:count,reportedPose:{xMm:d.getInt16(0,true),yMm:d.getInt16(2,true),angleHundredths:d.getUint16(4,true)},
   note:'La pose du paquet est définie par commande /pose ; elle ne constitue pas une odométrie et n’est pas utilisée par le SLAM.'};
 }
 class Assembler{
  constructor(onScan,onError=()=>{}){this.onScan=onScan;this.onError=onError;this.buffer='';this.rows=[];this.columns=0;this.index=0;this.invalid=false;this.counter=0;}
  reset(){this.rows=[];this.columns=0;this.index=0;this.invalid=false;}
  finish(){
   const rows=this.rows.slice(),bad=this.invalid;this.reset();if(!rows.length)return;
   try{
    if(bad)throw Error('Bloc série interrompu : indices ou colonnes incohérents.');
    const span=checkAngles(rows.map(row=>Number(row.split(',')[1]))),columns=rows[0].split(',').length;
    const csv=(columns===6?'point_index,angle_deg,dist_mm,intensity,x_lib_mm,y_lib_mm':'point_index,angle_deg,dist_mm,intensity')+'\n'+rows.join('\n');
    const stamp=new Date().toISOString().replace(/[:.]/g,'-'),name=`scan_live_${stamp}_${++this.counter}.csv`;
    this.onScan({scan:C.parseScan(csv,name),csv,span,receivedPoints:rows.length});
   }catch(e){this.onError(e.message);}
  }
  line(text){
   const line=text.trim();if(!line){this.finish();return;}
   const parts=line.split(','),values=parts.map(Number),valid=[4,6].includes(parts.length)&&parts.every(s=>s.trim()!=='')&&values.every(Number.isFinite)&&Number.isInteger(values[0])&&values[0]>=0&&Number.isInteger(values[2])&&values[2]>=0&&Number.isInteger(values[3])&&values[3]>=0&&values[3]<=255;
   if(!valid){if(this.rows.length)this.invalid=true;return;}
   if(values[0]===0){this.finish();this.columns=parts.length;}
   if(!this.rows.length&&values[0]!==0)return;
   if(values[0]!==this.index||parts.length!==this.columns)this.invalid=true;
   this.rows.push(line);this.index=values[0]+1;
   if(this.rows.length>1000){this.onError('Bloc trop long : synchronisation au prochain index 0.');this.reset();}
  }
  feed(text){
   this.buffer+=text;let end;
   while((end=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,end);this.buffer=this.buffer.slice(end+1);if(line.length>250){this.invalid=true;continue;}this.line(line);}
   if(this.buffer.length>65536){this.onError('Flux série non reconnu.');this.buffer='';this.reset();}
  }
 }
 return{checkAngles,binary,Assembler};
});
