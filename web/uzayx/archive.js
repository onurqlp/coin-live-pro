/* UzayX archive: user-picked ZIP / JSON compared locally, never sent to any server.
   Only known schemas are accepted; historical snapshots remain immutable. */
(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.UzayXArchive=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 const $=id=>root.document?.getElementById(id);
 const finite=x=>typeof x==='number'&&Number.isFinite(x);
 const n=(v,d=2)=>finite(v)?v.toLocaleString('tr-TR',{maximumFractionDigits:d,minimumFractionDigits:d}):'—';
 const stamp=s=>{let dt=new Date(s||'');return Number.isFinite(+dt)?dt.toLocaleString('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):String(s||'Tarih bilinmiyor');};
 const el=(tag,cls,txt)=>{const x=root.document.createElement(tag);if(cls)x.className=cls;if(txt!==undefined)x.textContent=txt;return x;};
 let source=null,imported=[],selected=-1;
 function fromCohort(obj){
   const c=obj||{},out={};
   ['TÜMÜ','LONG','SHORT','GELDI_OTOMATIK_GIRIS'].forEach(k=>{
     const x=c[k];if(!x)return;
     out[k]={closed:x.closed,positive:x.positive,net:finite(x.net_usdt)?x.net_usdt:x.realized_total_usdt};
   });
   return out;
 }
 function normalizeSnapshot(raw,label='Kaynak'){
   if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Geçerli JSON arşivi bulunamadı.');
   if(raw.schema==='uzayx.lessons.archive.v1'){
     if(!Array.isArray(raw.records))throw Error('Arşiv kayıt dizisi eksik.');
     return raw.records.map((r,i)=>normalizeSnapshot(r,label+' #'+(i+1))).flat();
   }
   if(raw.cohort_statistics&&typeof raw.cohort_statistics==='object'){
     return [{kind:'cohorts',name:label,at:raw.source_timestamp_utc||raw.recorded_at_utc||raw.day_utc,scan:raw.source_scan_id||'',cohorts:fromCohort(raw.cohort_statistics)}];
   }
   if(raw.cohorts&&typeof raw.cohorts==='object'){
     return [{kind:'cohorts',name:label,at:raw.generated_at_utc||raw.updated_at||'',scan:raw.source_scan_id||raw.scan_id||'',cohorts:fromCohort(raw.cohorts)}];
   }
   if(Array.isArray(raw.source_repositories)&&raw.source_repositories.some(x=>x?.name==='onurqlp/coin-live-pro')){
     const coin=raw.source_repositories.find(x=>x?.name==='onurqlp/coin-live-pro');
     return [{kind:'handoff',name:label,at:raw.captured_date||'',scan:coin.observed_sha||'',health:null,product:raw.project_codename||'COIN.LIVE devir'}];
   }
   if(raw.repos?.coinlive){
     return [{kind:'handoff',name:label,at:raw.package_created_at_date||'',scan:raw.repos.coinlive.observed_sha||'',
       health:raw.repos.coinlive.health_status,product:raw.repos.coinlive.production_version}];
   }
   throw Error('Bu dosya UzayX sonuç arşivi veya desteklenen devir özeti değil.');
 }
 function compare(a,b){
   const rows=[];
   ['TÜMÜ','LONG','SHORT','GELDI_OTOMATIK_GIRIS'].forEach(k=>{
     const old=a?.cohorts?.[k],now=b?.cohorts?.[k];
     if(!old||!now)return;
     rows.push({name:k,closedOld:old.closed,closedNow:now.closed,
       closedDelta:finite(old.closed)&&finite(now.closed)?now.closed-old.closed:null,
       netOld:old.net,netNow:now.net,
       netDelta:finite(old.net)&&finite(now.net)?Number((now.net-old.net).toFixed(5)):null});
   });
   return rows;
 }
 async function zipEntries(file){
   const buf=await file.arrayBuffer();if(buf.byteLength>12*1024*1024)throw Error('ZIP üst sınırı: 12 MB.');
   const dv=new DataView(buf),u8=new Uint8Array(buf);
   let eocd=-1;
   for(let i=buf.byteLength-22;i>=Math.max(0,buf.byteLength-65557);i--){
     if(dv.getUint32(i,true)===0x06054b50){eocd=i;break;}
   }
   if(eocd<0)throw Error('ZIP dizini okunamadı.');
   const count=Math.min(dv.getUint16(eocd+10,true),600),offset=dv.getUint32(eocd+16,true);
   let at=offset,files=[];
   for(let i=0;i<count;i++){
     if(at+46>buf.byteLength||dv.getUint32(at,true)!==0x02014b50)throw Error('ZIP kayıt dizini bozuk.');
     const method=dv.getUint16(at+10,true),size=dv.getUint32(at+20,true),plain=dv.getUint32(at+24,true),
       fl=dv.getUint16(at+28,true),ex=dv.getUint16(at+30,true),comment=dv.getUint16(at+32,true),
       pos=dv.getUint32(at+42,true),filename=new TextDecoder().decode(u8.subarray(at+46,at+46+fl));
     at+=46+fl+ex+comment;
     if(!/(ops-report|uzayx-lessons-history|v4-spark-review|03_CANLI_DURUM_2026-10-18|DEPO_LINKLERI_VE_SABIT_SHA)\.json$/i.test(filename)||plain>2500000)continue;
     if(pos+30>buf.byteLength||dv.getUint32(pos,true)!==0x04034b50)continue;
     const start=pos+30+dv.getUint16(pos+26,true)+dv.getUint16(pos+28,true),end=start+size;
     if(end>buf.byteLength)continue;
     const compressed=buf.slice(start,end);
     let data;
     if(method===0)data=compressed;
     else if(method===8){
       if(typeof DecompressionStream!=='function')throw Error('Tarayıcı ZIP açmayı desteklemiyor. JSON yükleyin.');
       try{data=await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();}
       catch{throw Error('ZIP içeriği açılamadı. JSON yükleyin.');}
     }else continue;
     if(data.byteLength>2500000)continue;
     files.push({name:filename,data:JSON.parse(new TextDecoder().decode(data))});
   }
   return files;
 }
 async function readFile(file){
   if(!file)throw Error('Dosya seçilmedi.');
   if(file.size>12*1024*1024)throw Error('En fazla 12 MB arşiv yüklenebilir.');
   if(/\.json$/i.test(file.name))return [{name:file.name,data:JSON.parse(await file.text())}];
   if(/\.zip$/i.test(file.name))return await zipEntries(file);
   throw Error('ZIP veya JSON arşivi seçin.');
 }
 function listSnapshots(){
   const day=Array.isArray(source?.db?.diary?.records)?source.db.diary.records:[];
   const history=day.flatMap((r,i)=>{try{return normalizeSnapshot(r,'Kalıcı günlük arşiv #'+(i+1));}catch{return [];}});
   return [...history,...imported].sort((a,b)=>String(a.at).localeCompare(String(b.at)));
 }
 function status(message,bad=false){
   const n0=$('archive-message');if(n0){n0.textContent=message;n0.className=bad?'archive-message bad':'archive-message';}
 }
 function render(){
   const target=$('archive-comparison'),select=$('archive-select');
   if(!target||!select)return;
   const items=listSnapshots();
   select.replaceChildren();
   items.forEach((item,i)=>{
     const opt=el('option','',stamp(item.at)+' · '+item.name+(item.kind==='handoff'?' · devir':''));
     opt.value=String(i);select.append(opt);
   });
   if(!items.length){target.replaceChildren(el('p','muted','Arşiv bulunamadı. JSON veya ZIP seçebilirsiniz.'));status('Günlük arşiv bekleniyor.');return;}
   selected=Math.min(Math.max(selected,0),items.length-1);select.value=String(selected);
   const prior=items[selected],now={kind:'cohorts',cohorts:fromCohort(source?.db?.review?.cohorts),at:source?.db?.manifest?.finished_at_utc};
   target.replaceChildren();
   const heading=el('div','archive-head');heading.append(el('b','','Seçilen: '+stamp(prior.at)),el('span','', 'Güncel kaynak: '+stamp(now.at)));target.append(heading);
   if(prior.kind==='handoff'){
     const p=el('p','muted','Devir anındaki V4 sürümü: '+(prior.product||'—')+' · sağlık: '+(prior.health||'—')+
       '. Şimdiki tarama durumu: '+(source?.db?.health?.status||'—')+
       '. Bu paket gerçekleşmiş sanal işlem PnL içermiyor; kasa karşılaştırması yapılmadı.');
     target.append(p);status('Devir paketi yerel olarak okundu; finansal veri uydurulmadı.');return;
   }
   const pairs=compare(prior,now);
   if(!pairs.length){target.append(el('p','muted','Karşılaştırılabilir kapalı işlem kohortu yok.'));return;}
   const grid=el('div','archive-grid');
   pairs.forEach(x=>{
     const card=el('article','archive-compare-card');
     card.append(el('strong','',x.name.replaceAll('_',' ')),
       el('span','','Kapanış '+n(x.closedOld,0)+' → '+n(x.closedNow,0)+' ('+(finite(x.closedDelta)?(x.closedDelta>=0?'+':'')+n(x.closedDelta,0):'—')+')'),
       el('span','','Tam kapanış neti '+n(x.netOld,4)+' → '+n(x.netNow,4)+' USDT'),
       el('small','',finite(x.netDelta)?'Kümülatif kayıt farkı: '+(x.netDelta>=0?'+':'')+n(x.netDelta,4)+' USDT':'PnL kapsamı doğrulanamadı'));
     grid.append(card);
   });
   target.append(grid);
   target.append(el('p','archive-caveat','Bunlar iki farklı tarihte tutulmuş kümülatif sanal kayıtların farkıdır; günlük kazanç, bağımsız strateji testi veya gerçek para değildir.'));
   status(items.length+' kayıt kullanılabilir. Dosyalar yalnız tarayıcıda okunur; sunucuya gönderilmez.');
 }

 async function fetchOldEvents(){
   const box=$('history-events');if(!box)return;
   const commit=source?.sourceCommit;
   if(!/^[a-f0-9]{40}$/.test(commit||'')){box.replaceChildren(el('p','muted','Önce doğrulanmış veri kaynağı gerekli.'));return;}
   box.replaceChildren(el('p','muted','Geçmiş kayıtlar salt-okunur açılıyor…'));
   const url='https://raw.githubusercontent.com/onurqlp/coin-live-pro/'+commit+'/web/data/v4-history-index.json';
   try{
     const response=await fetch(url,{cache:'no-store'});
     if(!response.ok)throw Error('Arşiv HTTP '+response.status);
     const doc=await response.json();
     if(!Array.isArray(doc.events)||doc.scan_id!==source.db.manifest?.scan_id)
       throw Error('Eski olay arşivi doğrulanmadı.');
     box.replaceChildren();
     const info=el('p','muted tiny',doc.events.length+' arşiv olayı · eski kayıtlar işlem sinyali değildir.');
     box.append(info);
     doc.events.slice(0,80).forEach(e=>{
       const line=el('div','archive-event');
       line.append(el('strong','',String(e.symbol||'—')+' '+String(e.side||'')),
         el('span','',String(e.type||'OLAY')+' · '+stamp(e.event_time_utc)),
         el('small','',String(e.data_quality||'')));
       box.append(line);
     });
   }catch(err){box.replaceChildren(el('p','muted','Eski kayıtlar alınamadı: '+String(err.message||err)));}
 }
 if(root.document){
   root.addEventListener('uzayx:loaded',e=>{source=e.detail;render();});
   root.document.addEventListener('DOMContentLoaded',()=>{
     $('archive-select')?.addEventListener('change',e=>{selected=Number(e.target.value);render();});
     $('archive-check')?.addEventListener('click',render);
     $('history-load')?.addEventListener('click',fetchOldEvents);
     $('archive-file')?.addEventListener('change',async e=>{
       const file=e.target.files?.[0];if(!file)return;
       status('Dosya yerel olarak inceleniyor.');
       try{
         const docs=await readFile(file);let records=[];
         docs.forEach(d=>{try{records.push(...normalizeSnapshot(d.data,d.name));}catch{}});
         if(!records.length)throw Error('ZIP içinde karşılaştırılabilir JSON arşivi bulunamadı.');
         imported=imported.concat(records).slice(-120);
         selected=listSnapshots().indexOf(imported.at(-1));render();
       }catch(err){status(String(err.message||err),true);}
       finally{e.target.value='';}
     });
   });
 }
 return {normalizeSnapshot,compare};
});