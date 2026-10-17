export default async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET') return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  // MAKINE is optional. No guessed endpoint, no write permission, no auto-filtering core signals.
  return res.status(200).json({schema:'coinlive.v5.overlay.v1',source:'MAKINE_CORE',state:'NOT_CONNECTED',readOnly:true,changesCoreSignals:false,observations:[]});
}
