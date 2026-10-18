import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const config=JSON.parse(fs.readFileSync(fileURLToPath(new URL('../vercel.json',import.meta.url)),'utf8'));
const headers=Object.fromEntries(config.headers.find(x=>x.source==='/(.*)').headers.map(x=>[x.key.toLowerCase(),x.value]));
test('V5 browser content may only execute self scripts and cannot be framed',()=>{
 const csp=headers['content-security-policy'];
 for(const rule of ["default-src 'self'","script-src 'self'","connect-src 'self'","object-src 'none'","frame-ancestors 'none'","worker-src 'self'"])
  assert.ok(csp.includes(rule),rule);
 assert.equal(csp.includes('unsafe-inline'),false);assert.equal(csp.includes('unsafe-eval'),false);
 assert.equal(headers['x-frame-options'],'DENY');
 assert.equal(headers['x-content-type-options'],'nosniff');
});
test('unused hardware access is disabled in browser',()=>{
 const policy=headers['permissions-policy'];
 for(const key of ['camera','microphone','geolocation','payment'])assert.ok(policy.includes(key+'=()'));
});
