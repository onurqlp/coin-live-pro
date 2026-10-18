import { loadHistory } from '../lib/history.mjs';
import { SourceError } from '../lib/snapshot.mjs';
export default async function handler(req,res){
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET')return res.status(405).json({state:'NO_VERIFIED_HISTORY',error:'METHOD_NOT_ALLOWED',events:[]});
 try{return res.status(200).json(await loadHistory({commit:String(req.query.commit||'')}));}
 catch(error){return res.status(error instanceof SourceError?error.status:503).json({
  state:'NO_VERIFIED_HISTORY',error:error instanceof SourceError?error.code:'UNEXPECTED_ERROR',
  events:[],noRealOrders:true
 });}
}
