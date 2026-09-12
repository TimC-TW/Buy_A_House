// Vercel Serverless Function: /api/traffic
// Required env: TDX_CLIENT_ID, TDX_CLIENT_SECRET
// Finds the nearest city VD and converts speed ratio to a 0-100 congestion score.
// TDX visitor mode is rate-limited; production should use member credentials.
const BASE="https://tdx.transportdata.tw";
async function token(){
  const body=new URLSearchParams({
    grant_type:"client_credentials",
    client_id:process.env.TDX_CLIENT_ID||"",
    client_secret:process.env.TDX_CLIENT_SECRET||""
  });
  const r=await fetch(BASE+"/auth/realms/TDXConnect/protocol/openid-connect/token",{
    method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body
  });
  if(!r.ok)throw new Error("TDX auth HTTP "+r.status);
  return (await r.json()).access_token;
}
const dist=(a,b)=>{const R=6371000, p=Math.PI/180;
  const dLat=(b.lat-a.lat)*p,dLon=(b.lon-a.lon)*p;
  const x=Math.sin(dLat/2)**2+Math.cos(a.lat*p)*Math.cos(b.lat*p)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(x));
};
export default async function handler(req,res){
  const lat=Number(req.query.lat),lng=Number(req.query.lng);
  if(!Number.isFinite(lat)||!Number.isFinite(lng))return res.status(400).json({ok:false,error:"lat/lng required"});
  const city=(lat>=25.0&&lng>=121.4&&lng<=121.65)?"Taipei":"NewTaipei";
  try{
    const tk=await token();
    const H={Authorization:"Bearer "+tk};
    const vdR=await fetch(BASE+"/api/basic/v2/Road/Traffic/VD/City/"+city+"?$format=JSON",{headers:H});
    if(!vdR.ok)throw new Error("TDX VD HTTP "+vdR.status);
    const vds=await vdR.json();
    const candidates=vds.filter(v=>v.PositionLat!=null&&v.PositionLon!=null).map(v=>({
      raw:v,lat:Number(v.PositionLat),lon:Number(v.PositionLon),
      d:dist({lat,lng},{lat:Number(v.PositionLat),lon:Number(v.PositionLon)})
    })).sort((a,b)=>a.d-b.d).slice(0,3);
    if(!candidates.length)return res.status(404).json({ok:false,error:"No nearby VD"});
    let live=null;
    for(const c of candidates){
      const id=c.raw.VDID;
      const r=await fetch(BASE+"/api/basic/v2/Road/Traffic/Live/VD/City/"+city+"/"+encodeURIComponent(id)+"?$format=JSON",{headers:H});
      if(r.ok){
        const x=await r.json();
        if(Array.isArray(x)&&x.length) {live={c,x:x[0]};break;}
      }
    }
    if(!live)return res.status(404).json({ok:false,error:"No live traffic data"});
    const x=live.x;
    // Common TDX fields: Speed and Volume may be arrays. Prefer first available speed.
    let speed=Number(x.Speed);
    if(!Number.isFinite(speed)&&Array.isArray(x.Speed))speed=Number(x.Speed[0]);
    // Without a reliable local speed limit, use a conservative city-road reference.
    // This is explicitly a proxy and is not presented as a TDX-provided congestion score.
    const ref=40;
    const score=Number.isFinite(speed)?Math.max(0,Math.min(100,100*speed/ref)):null;
    if(score===null)return res.status(404).json({ok:false,error:"Live speed unavailable"});
    return res.status(200).json({
      ok:true,score,city:city==="Taipei"?"臺北市":"新北市",
      roadName:live.c.raw.RoadName||"",dataTime:x.DataCollectTime||x.DataCollectTime,
      speed,source:"TDX 路況資訊 / VD"
    });
  }catch(e){return res.status(502).json({ok:false,error:String(e)});}
}
