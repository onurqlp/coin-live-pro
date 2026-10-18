# COIN.LIVE TAPE · FUTURES V6 / AR-GE ve uygulama sözleşmesi
**Tarih:** 18 Ekim 2026 · **Durum:** RESEARCH ONLY · **Geliştirme dalı:** research/futures-v6-arge-20261018

> Amaç: 3 mevcut depoyu koruyarak, vadeli kripto piyasalarında erken LONG/SHORT kurulumlarının veriyle ölçüldüğü, düşük gecikmeli tape ve emir defteri bağlamıyla zenginleştirildiği, maliyet ve kaldıraç etkisinin hesaplandığı mobil-first bir araştırma sistemi. Kısa sürede kesin para kazanç hedefi, doğrulanmış yatırım getirisi değildir. Gerçek emir/özel API anahtarı bu AR-GE kapsamının dışındadır.

## 1. Kaynak envanteri ve canlı gözlem

| Kaynak | Doğrulanan kanıt | Karar |
| --- | --- | --- |
| onurqlp/coin-live-pro | web/release.json: V4.03. 18.10 13:14 UTC ops-report.json ve v4-manifest.json. OKX 23 denenmiş / 22 doğrulanmış. | Tek pazar-radar ve sanal ledger üreticisi korunur. |
| onurqlp/makine-core | 18.10 13:21 UTC coinlive-support.json: B1 funding gözlemi; trade_candidates boş. | Bağımsız salt-okunur 6 modül. |
| onurqlp/alti-quant-lab | 18.10 12:44 UTC site/report.json: 2 OKX funding veri gözlemi, Binance HTTP 451, A1/A2/A3 ve T0 kaynak engelleri. | Eksik kaynaktan pozitif sinyal üretilmez. |
| Vercel coinlive-v5-preview | /api/snapshot ve /api/overlay 18.10 tarihinde HTTP 200 ile sınandı. Snapshot, V4.03 kaynak manifest ve hash doğruluyor; overlay READ_ONLY_RESEARCH ve boş recommendations döndürüyor. Projede SSO koruması etkin. | V5 staging çalışır; anonim yayın ve entegre strateji başarı kanıtı değildir. |

**Mevcut risk politikasında** ana sanal hesap 10.000 USDT, 3x sanal kaldıraç, risk/işlem %0,5, toplam açık risk %2, azami 3 pozisyon, gerçek emir false. Bu politikayı AR-GE'de değiştirme.

**Örnek deneysel performans (18.10 13:14 UTC):** 827 sanal niyet, 584 kapanmış bilet, 170 pozitif / 414 negatif; pozitif kapanış payı %29,11; deneysel muhasebe net realize -21,21686 USDT, floating +5,31623 USDT, equity 9.984,09937 USDT. Ana V4 10.000 USDT hesabında kapanmış emir 0. 7 V4 stratejisi için yayınlanan ops-report pencerelerinde entry_eligible 0. Bu iki uç açıkça ayrılmalı: sert teyit az işlem üretirken erken denemeler fazla ve şu an net olumsuz.

**Muhasebe mutabakat açığı:** Aynı rapordaki TÜMÜ kapalı kohort realized_total -31,51012 USDT ve global experimental_spark.realized_net -21,21686 USDT bire bir eşit değil; açık biletlerde kısmi TP/zarar, gerçekleşme günü ve kohort hesaplarının detaylı mutabakatı gerekli. Ayrı dönem/kohort toplamlarını üst üste ekleyerek PnL raporlamayın.

**Şimdiki deneysel maliyet varsayımı:** engine/v4_spark_paper.py: FEE=0.0006 (yön başına %0,06), SLIPPAGE=0.0003 (yön başına %0,03); tam aç/kapa için brüt değişim hariç yaklaşık %0,18 notional yük. Funding 'UNMODELED'. Kullanıcının gerçek ücret ve likidite düzeyi doğrulanmadan bunu kesin maliyet saymayın.

## 2. V6 mimarisi (aynı depolar, yeni repo yok)

- COIN.LIVE ana depo: aynı 7 V4 stratejisi; yeni *tape/* modülü, tek kanonik futures symbol/instrument metadata modeli, snapshot API, forward-only signal/intent ledger ve pozisyon-risk araştırması. Eski ledgers korunur.
- MAKİNE CORE: A1/A2/A3/B1/B2/T0 bağımsız destek durumunu ve alti upstream doğrulamasını korur. Sinyal veya paper ledger'a yazma yetkisi yok. Emekli 57 genel fikir geri gelmez.
- ALTI QUANT LAB: funding / spread research upstream; yalnız iki borsadan eşzamanlı emir verilebilir hacim, ücret, settlement ve hesap erişimi kanıtlandığında karşılaştırma yürür. A1/A2/A3/T0 gerçek kripto tape sinyaliymiş gibi birleştirilmez.
- Vercel V5: mobil/PWA read-only terminal. API response için scan_id, source_sha, exchange_time, ingest_time, data_age, schema_version, signal_stage ve cost_model_state ayrı tutulur. Vercel Functions kalıcı milisaniye ölçekli WebSocket tüketicisi olarak kullanılmaz.
- Yeni kalıcı düşük-gecikmeli veri toplayıcı: mevcut coin-live-pro repo içinden konfigüre edilen bir Worker / Durable Object ya da kalıcı container + kalıcı depolama. GitHub Actions mevcut 5 dakikalık OHLC ve yayın işini yürütmeye devam eder; tek başına order-flow/tape değildir.
- Gerçek emir kapısı: Bu aşamada hiçbir endpoint, secret veya otomatik emir sunulmaz.

### Veri sözleşmesi

Her tick/trade için venue, normalized_symbol, contract_size, price, quantity_base, aggressor_side, exchange_timestamp, receive_timestamp, sequence_id, source_channel; her kitap snapshot/delta için seq/prevSeq, crossed-book ve checksum kontrolü; her funding için gerçekleşmiş/tahmini ayrımı ve event settlement saati; her gösterge için veri kaynağı ve gecikme etiketi. Sequence gap veya clock skew varsa signal UNKNOWN. Binance/OKX/Bybit kontrat miktarları farklıdır; çıplak kontrat adedi toplanmaz.

## 3. V6 araştırma hipotezleri: yalnız doğrulanırsa paper aday

H1: **Regime-aware trend continuation** — 1D/4H yön uyumu + kapanmış 1H/15m kırılımı + tape agresif alım/satım dengesinin 3-5m üzerinde devamlılığı.

H2: **Sweep + reclaim** — likidite seviyesinde hızlı süpürme, geri kazanım, azalan karşıt agresif akış; işlemlerin kronolojisiyle teyit. Her wick likidasyon veya manipülasyon değildir.

H3: **Breakout retest** — zamansal olarak ayrı iki kapanmış mum ve seviyenin tekrar testinde gerçekleşen agresör hacmi; mevcut RETEST_SEQUENCE_UNVERIFIED durumuna sahte onay eklenmez.

H4: **OI-price divergence** — farklı timestamp ve periyotta fiyat/OI değişimleri; trader pozisyon yönü, kaldıraç veya likidasyon nedeni gibi kanıtlanamayan yorumlar kullanılmaz.

H5: **Funding crowding filter** — gerçekleşmiş funding, bir sonraki tahmin, değişken settlement aralıkları, mark-price hareketleri ve iki-borsa verisinin geçerliliği; tek gerçekleşmiş olay ileriye dönük getiri olarak yıllıklandırılmaz.

H6: **Market impact / no-trade gate** — spread, top 5/20/50 market depth, VWAP execution, taker fee, slippage stress, yoğunlaşma, düşük hacimli coinlerde kalıcı book vs spoof benzeri iptal şüphesi; niyet kanıtlanmadan "spoofing tespit" denmez.

Hipotezler aynı mumlar üzerinde geriye dönük sürekli optimize edilmez; geçmiş eğitim / doğrulama / OOS / forward dönemleri kronolojik olarak ayrılır. Rakip modellerin sonuçları ve işlem maliyetleri karşılaştırılır; skorlara kazanma olasılığı etiketi konulmaz.

## 4. Kaldıraç / risk (sanal, ayarlanabilir üst sınır 20x)

Önce pozisyon riski, sonra kaldıraç seçilir. Örnek tasarım:
- Başlangıç değerlendirme varsayımı: işlem başına equity'nin %0,25-%0,50'si; günlük kayıp limiti ve ardışık kayıp koruması araştırma parametresi. Gerçek sonuç görünmeden eşik üretime yükseltilmez.
- Brüt notional sınırı: min(risk_budget/(stop_frac+roundtrip_cost_frac+gap_stress_frac), margin_budget*leverage, real_depth_capacity). Stop / slippage / gap yetersizse NO_TRADE.
- Isolated margin ve çok pozisyonda ortak beta/korelasyon maruziyeti analiz edilir. Liquidation buffer, maintenance margin, mark price, funding, exchange precision/step size her enstrüman için ayrı modellenir.
- UI senaryoları 3x, 5x, 10x, 15x, 20x olabilir; 20x tavan, bir öneri veya varsayılan değildir. Aynı notional için kaldıraç artırmak kar potansiyelini büyütmez; bloke marjı azaltır ve tasfiye yakınlığını artırır.
- Acil güvenlik stopu: stale feed, missing book seq, gerçekleşmeyen sanal fill, spread şoku, latency sıçraması, günlük zarar limitinde yeni sanal giriş kapat.

## 5. Test yöntemi ve geçiş kapıları

**P0 — muhasebe/sinyal tutarlılığı:** İki eksili global/cohort PnL mutabakatı; 7 strateji için entry_eligible neden 0 analizi; 'şimdi 584 kapanmış' kohortunun birbirinden bağımsız olup olmadığının incelenmesi; funding maliyeti UNKNOWN etiketi.

**P1 — data ingestion:** 24 saat WebSocket trade/book akışı, seq/reconnect/checksum testi, venue erişimi, yoğun günlerde p99 latency ölçümü, ani kopmada 'STALE'. Veri sözleşmesine 50+ test.

**P2 — tape hypotheses:** Sinyal üretimi WATCH→SETUP→CONFIRMED→PAPER_INTENT; NOT_EXECUTABLE veya BLOCKED durumu hiçbir ticarete dönmez; fallback yoksa no-trade.

**P3 — forward walk:** Başlangıçta 7/14/30/90 gün raporları. Rejim bazlı, işlem maliyeti dahil ve idempotent ilerleyen sanal fill (gelecek bar/gerçek orderbook snapshot); tarihsel simülasyon ile geleceğe dönük sonuç ayrımı. En az 200 bağımsız kapanmış olay ve birden fazla volatilite rejimi değerlendirme hedefi, tek başına istatistiksel ispat değildir.

**P4 — risk/ürün:** Mobil 360/390/768/1366 px testleri; grafik tek dokunuş; doğru zaman damgası; PnL mutabakatı; no real orders; staging API şeması; V4 hash ve 10K hesap değişmemiş. Üretime geçiş ayrı karar.

### Kabul/red kıstasları
- Her fırsat için kaynak ve tazelik zorunlu.
- Kurallar ileriye bakma (look-ahead), survivorship ve sahte fill içermiyor.
- OOS net expectancy, max drawdown, 95p adverse excursion, slippage stress, fee/funding ve stopped-out payı görünür; kalibre olmayan skor "başarı %" olarak gösterilmez.
- 20x azami UI simülasyonudur; pozisyon boyutu, günlük zarar ve gap/likidasyon riskini aşan bilet reddedilir.
- Operatör erişimi olmayan borsadan gelen HTTP 451, geçici DNS veya '2nd venue missing' durumunda kağıt üzerindeki funding arbitrajı ACTIONABLE olmaz.
- Kendi hesabına yabancı platformda türev ürün kullanımının hukuki/hesapsal uygunluğu doğrulanmadan gerçek emir açılmaz.

## 6. Düzenleyici doğrulama
Türkiye'de 13.03.2025 yürürlüğe giren III-35/B.2 sayılı Tebliğ m.14, Türkiye'deki platformlar bakımından listeli kripto varlıkların kaldıraçlı ve türev işleme konu edilmesini yasaklar. Bireyin yurtdışı platform kullanımı için aynı hükümden otomatik bir genel hukuki sonuç çıkarılmaz; hizmetin Türkiye'de sunulması, hesap/ikamet uygunluğu, platform erişimi ve güncel mevzuat uzman incelemesi ister. Kaynak: https://spk.gov.tr/duyurular/basin-duyurulari/2025/kripto-varlik-hizmet-saglayicilarina-iliskin-iki-teblig-yayimlandi ve metin m.14 https://www.prmfinans.com/iii-35-b-2-kripto-calisma-esaslari-ve-seryet

## 7. Resmî API kaynakları
- OKX v5: https://tr.okx.com/docs-v5/
- OKX 2026-10-31 ELP→RPI deprecation ve WebSocket kitap şeması: https://tr.okx.com/docs-v5/log_en/
- Bybit V5 orderbook snapshot/delta: https://bybit-exchange.github.io/docs/v5/websocket/public/orderbook
- Bybit linear WS: https://bybit-exchange.github.io/docs/v5/ws/connect
- Binance futures mark/funding market data: https://developers.binance.info/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/market-data

### Koruma ilkesi
Bu dal yalnız araştırma dokümanı içerir. Üretim main, Actions zamanlayıcısı, sanal muhasebe, API yetkileri ve Vercel alias değiştirilmedi. Gerçek futures emri açılmadı.
