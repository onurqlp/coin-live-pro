'use strict';
// Full-fidelity UZAYX Atlas V4: restores all six Excel-derived research tables.
// Usage: node scripts/restore_uzayx_atlas_v4.cjs [output-folder]
// Requires only built-in Node.js modules, creates no live market data or trades.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const root=path.resolve(__dirname,'..');
const input=path.join(root,'research/uzayx-v4.1/UZAYX_YANARDAG_ATLAS_V4_COMPLETE.json.br');
const out=path.resolve(process.argv[2]||path.join(root,'research/uzayx-v4.1/export'));
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const buffer=fs.readFileSync(input);
const compressedDigest='9508e1ff7c512316c9e60d47a081e8e7f3b1cd1b5e5ba96c4f8edacdd76505b2';
const originalDigest='c5538743a2550bede523fa5ffd04aed833eff45865b55fa7947e46870d77d821';
if(sha(buffer)!==compressedDigest)throw Error('Atlas compressed bytes changed');
const raw=zlib.brotliDecompressSync(buffer);
const data=JSON.parse(raw.toString('utf8'));
if(data?.metadata?.source_sha256!==originalDigest)throw Error('Source Excel provenance mismatch');
const counts={Olay_Atlasi:31,'50_Aday':50,Desenler:12,Bulgular:10,Kaynaklar:36,Grafik_Noktalari:11};
for(const [key,n] of Object.entries(counts)){
 const sheet=data.tables?.[key];
 if(!Array.isArray(sheet?.columns)||!Array.isArray(sheet?.rows)||sheet.rows.length!==n)
   throw Error(key+': row count/schema mismatch');
 if(sheet.rows.some(row=>!Array.isArray(row)||row.length!==sheet.columns.length))
   throw Error(key+': rectangular dataset mismatch');
}
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'uzayx-atlas-v4-complete.json'),JSON.stringify(data,null,2)+'\n','utf8');
const q=x=>{
 // Formula-looking text is quoted and prefixed to prevent CSV spreadsheet formula execution.
 if(x===null||x===undefined)return '';
 if(typeof x==='number'||typeof x==='boolean')return String(x);
 let v=typeof x==='string'?x:String(x);
 if(/^[=+@\-]/.test(v))v="'"+v;
 return /[",\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;
};
for(const [name,sheet] of Object.entries(data.tables)){
 const rows=[sheet.columns,...sheet.rows].map(row=>row.map(q).join(','));
 fs.writeFileSync(path.join(out,name+'.csv'),'\ufeff'+rows.join('\r\n')+'\r\n','utf8');
}
console.log(JSON.stringify({source_sha256:originalDigest,tables:Object.fromEntries(Object.entries(counts)),output:out,live_trades:false,backtests:false}));
