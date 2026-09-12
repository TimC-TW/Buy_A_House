// Vercel Serverless Function: /api/maps-key
// Set GOOGLE_MAPS_API_KEY in Vercel Environment Variables.
// Restrict this key to your Vercel domain and the APIs you actually use.
export default function handler(req, res) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return res.status(500).json({ ok:false, error:"Missing GOOGLE_MAPS_API_KEY" });
  res.setHeader("Cache-Control","public, max-age=300");
  return res.status(200).json({ ok:true, key });
}
