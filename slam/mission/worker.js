importScripts('../../visualisation/core.js','../../visualisation/grid.js','../../visualisation/grid-localisation.js','../session.js');
let session=new LidarSlam.Session();
function snapshot(){return {grid:JSON.parse(session.grid.save()),scans:session.accepted,events:session.events,lastPose:session.lastPose};}
self.onmessage=async({data:m})=>{
 try{
  let result;
  if(m.type==='load'){const next=LidarSlam.Session.load(m.text);session=next;result=snapshot();}
  else if(m.type==='reset'){session=new LidarSlam.Session();result=snapshot();}
  else if(m.type==='add'){const event=await session.addAsync(m.scan,null);result={event,snapshot:snapshot()};}
  else if(m.type==='save')result=session.save();
  else throw Error('Commande de calcul inconnue.');
  postMessage({id:m.id,result});
 }catch(e){postMessage({id:m.id,error:e.message});}
};
