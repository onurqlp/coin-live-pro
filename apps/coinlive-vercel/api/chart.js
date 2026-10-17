import { loadChart } from '../lib/chart.mjs';
import { SourceError } from '../lib/snapshot.mjs';
export default async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET') return res.status(405).json({state:'NO_VERIFIED_CHART',error:'METHOD_NOT_ALLOWED'});
  try {return res.status(200).json(await loadChart({
    symbol:String(req.query.symbol||'BTCUSDT').toUpperCase(),
    timeframe:String(req.query.tf||'1H').toUpperCase(),
    commit:String(req.query.commit||'')
  }));}
  catch(error){return res.status(error instanceof SourceError?error.status:503).json({
    state:'NO_VERIFIED_CHART',error:error instanceof SourceError?error.code:'UNEXPECTED_ERROR',
    message:error instanceof SourceError?error.message:'Doğrulanmış grafik kullanılamıyor',candles:[],markers:[],noRealOrders:true
  });}
}
