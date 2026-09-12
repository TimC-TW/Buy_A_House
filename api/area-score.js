// Vercel Serverless Function: /api/area-score
// Uses Ministry of Finance Fiscal Information Agency 2023 (ROC 112)
// district/village comprehensive-income statistics for Taipei and New Taipei.
// This is an income-based regional proxy, not a claim about individual residents.
const SOURCES = {
  "臺北市":"https://www.fia.gov.tw/WEB/fia/ias/ias112/112_165-A.csv",
  "台北市":"https://www.fia.gov.tw/WEB/fia/ias/ias112/112_165-A.csv",
  "新北市":"https://www.fia.gov.tw/WEB/fia/ias/ias112/112_165-F.csv"
};

function parseCSV(text){
  const lines=text.replace(/^\uFEFF/,"").split(/\r?\n/).filter(Boolean);
  if(!lines.length)return [];
  const parseLine=(line)=>{
    const a=[]; let cur="", q=false;
    for(let i=0;i<line.length;i++){
      const ch=line[i];
      if(ch==='"'){ if(q && line[i+1]==='"'){cur+='"';i++;} else q=!q; }
      else if(ch===',' && !q){a.push(cur.trim());cur="";} else cur+=ch;
    }
    a.push(cur.trim()); return a;
  };
  const h=parseLine(lines[0]);
  return lines.slice(1).map(x=>{const a=parseLine(x);const o={};h.forEach((k,i)=>o[k]=a[i]??"");return o;});
}
function num(v){const x=Number(String(v).replace(/,/g,""));return Number.isFinite(x)?x:0}
function districtFromAddress(a){
  const m=String(a).match(/(?:臺北市|台北市|新北市)([^市縣]{1,6}區)/);
  return m?m[1]:"";
}
async function load(city){
  const r=await fetch(SOURCES[city]);
  if(!r.ok)throw new Error(city+" source HTTP "+r.status);
  return parseCSV(await r.text());
}
export default async function handler(req,res){
  const address=req.query.address||"";
  const district=districtFromAddress(address);
  const city=address.includes("新北市")?"新北市":(address.includes("臺北市")||address.includes("台北市")?"臺北市":"");
  if(!city||!district)return res.status(400).json({ok:false,error:"Cannot determine Taipei/New Taipei district"});
  try{
    const rows=await load(city);
    // Aggregate village-level tax data to district using taxpayer-weighted average.
    // Field names are from FIA CSV; tolerate minor header variations.
    const districtRows=rows.filter(r=>String(r["鄉鎮市區"]||"").includes(district));
    if(!districtRows.length)return res.status(404).json({ok:false,error:"District not found in official dataset"});
    let income=0, taxpayers=0;
    for(const r of districtRows){
      const n=num(r["納稅單位(戶)"]);
      const avg=num(r["平均數"]);
      if(n>0 && avg>0){income+=avg*n;taxpayers+=n;}
    }
    if(!taxpayers)return res.status(404).json({ok:false,error:"No income observations"});
    const districtAvg=income/taxpayers;

    // Normalize against all districts in both cities using the same source family.
    const all=[];
    for(const c of ["臺北市","新北市"]){
      const rr=await load(c);
      const by={};
      for(const r of rr){
        const d=r["鄉鎮市區"]; if(!d)continue;
        const n=num(r["納稅單位(戶)"]), avg=num(r["平均數"]);
        if(n>0&&avg>0){by[d]??={income:0,n:0};by[d].income+=avg*n;by[d].n+=n;}
      }
      for(const [d,v] of Object.entries(by)) if(v.n) all.push(v.income/v.n);
    }
    const min=Math.min(...all), max=Math.max(...all);
    const score=max===min?50:100*(districtAvg-min)/(max-min);
    return res.status(200).json({
      ok:true,score,city,district,year:2023,
      metric:"區域綜合所得平均數（納稅單位加權）",
      income:districtAvg,
      source:"財政部財政資訊中心 112 年綜稅綜合所得總額各縣市鄉鎮村里統計分析表"
    });
  }catch(e){return res.status(502).json({ok:false,error:String(e)});}
}
