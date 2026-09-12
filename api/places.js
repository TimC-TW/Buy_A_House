// Vercel Serverless Function: /api/places
// Required env: GOOGLE_MAPS_API_KEY
export default async function handler(req, res) {
  const { lat, lng } = req.query;
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return res.status(500).json({ok:false,error:"Missing GOOGLE_MAPS_API_KEY"});
  if (!lat || !lng) return res.status(400).json({ok:false,error:"lat/lng required"});

  async function nearby(type, radius) {
    const r = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "X-Goog-Api-Key":apiKey,
        "X-Goog-FieldMask":"places.id,places.displayName,places.location,places.primaryType"
      },
      body:JSON.stringify({
        includedTypes:[type],
        maxResultCount:20,
        rankPreference:"DISTANCE",
        locationRestriction:{circle:{center:{latitude:Number(lat),longitude:Number(lng)},radius}}
      })
    });
    if (!r.ok) throw new Error("Google Places HTTP "+r.status);
    return (await r.json()).places || [];
  }

  try {
    const [convenience, supermarkets] = await Promise.all([
      nearby("convenience_store",250),
      nearby("supermarket",1500)
    ]);
    const c = Math.min(convenience.length,4);
    const s = Math.min(supermarkets.length,4);
    const cScore = [0,60,80,90,100][c];
    const sScore = [0,60,85,95,100][s];
    const score = cScore*0.40+sScore*0.60;
    return res.status(200).json({
      ok:true, score,
      convenienceCount:convenience.length,
      supermarketCount:supermarkets.length,
      convenience:convenience.map(x=>x.displayName?.text).filter(Boolean),
      supermarkets:supermarkets.map(x=>x.displayName?.text).filter(Boolean),
      source:"Google Places API (New)"
    });
  } catch(e) {
    return res.status(502).json({ok:false,error:String(e)});
  }
}
