# UZAYX V4.1 — Altı Modül + Yanardağ Atlası + Fırsat Karar Mimarisi
**Tarih:** 19 Ekim 2026  
**Provenans:** Kullanıcı tarafından yüklenen `UZAYX_YANARDAG_ATLAS_V4.xlsx` ile 18 Ekim tarihli `UZAYX_ANA_DUSUNCE_MANIPULASYON_UPDATE_V2.txt`; destek kodu `onurqlp/alti-quant-lab`, `onurqlp/makine-core`.  
**Kaynak Excel SHA256:** `c5538743a2550bede523fa5ffd04aed833eff45865b55fa7947e46870d77d821`.

## Amaç ve kapsam
UZAYX, geçmiş yüksek fiyat hareketlerini veri kaynağına sadık kalarak gözlemler; gelecekteki erken hareket / trend devamı / düzeltme / dönüş / NO_TRADE ihtimallerini, gerçekleşme maliyetleri ve yanlış alarm analiziyle karşılaştıracak **araştırma sistemi** kurar. Amaç otomatik emir değil: gerekçesi, kaynağı, sınırları ve gözlemi ayrılmış hipotez üretmektir. Bir coin parabolik yükseldi diye SHORT kabul edilmez. Manipülasyon şüphesi hukuki/teknik kanıt anlamına gelmez.

## V4 atlas içe aktarma: doğrulanabilir sayımlar
| Excel sayfası | Satır | Durum |
|---|---:|---|
| Olay_Atlasi | 31 | Kaynak makalelerdeki olay penceresi/evre; fiyat OHLCV olarak kullanılamaz |
| 50_Aday | 50 | **Yıllık** kazanan taraması; 1–10 gün sinyalinin yerine geçmez |
| Desenler | 12 | Hipotez ve doğrulama engelleri |
| Bulgular | 10 | Makale bulguları, metodoloji uyarıları |
| Kaynaklar | 36 | Yayınevi, URL, inceleme ve veri hakkı kısıtları |
| Grafik_Noktalari | 11 | Yayınlarda verilen tarihsel noktalar; kapanmış borsa mumları değildir |
Tüm kaynak Excel/CSV/JSON dosyaları ayrı kullanıcının dosya paketiyle teslim edilir. GitHub'ın `web/data/uzayx-atlas-v4.json` arayüz tüketim kaydı **31 olayın tarih/sembol/yön/kaynak özetini, 50 yıllık adayın yıllık tarama getirisini, 12 desen indeksini** içerir; geriye kalan ağır kaynak/not tabloları bu hafif web çıktısına kopyalanmamıştır. Tam Excel veri tabanını yükleme ve lisans durumunu arşiv etiketinden farklı göstermeme.

**Kesinlikle çıkarılmayacak varsayımlar:** Sinyal anı, gerçek futures listelenme zamanı, alım-satım fiyatı, OHLCV, MFE/MAE, doğrulanmış balina manipülasyonu, canlı emir erişimi, geçmiş backtest ve kâr. `web/data/uzayx-atlas-v4.json` her kaydı `ohlcv_verified=false`, `backtested=false` ile işaretler.

## Altı modülün gerçek görevi
| Kod | Mevcut gerçek veri kapsamı | V4.1 işlevi | Kısıt |
|---|---|---|---|
| **A1** | KO/PEP kamuya açık Nasdaq kapanışları (508 ortak seans, *düzeltilmemiş/karışık*) | Hisse fiyat ilişkilerinin risk rejimine bilgi katma hipotezi | Lisans, borrow/short, fiyat düzeltmesi kanıtı yok; kripto mikro-sinyal değil |
| **A2** | IVV/VOO benzer kamuya açık kapanışlar | ETF rejimi/çapraz piyasa ayrışması araştırması | Endeks/NAV, veri hakkı, short erişimi yok; ETF arbitrajı değil |
| **A3** | OKX BTC/ETH/SOL kapalı günlük mumlar (80 eşleşmiş gün; tarama anına bağlı) | Sektör yönü, gecikme ve ikinci dalga bağlamı | Johansen rank, OOS, işlem maliyeti doğrulanmadı |
| **B1** | OKX gerçekleşmiş BTC/ETH funding gözlemleri | Kaldıraç ve funding kalabalığına bakış; OI olmadan squeeze sonucu yok | Tek başına futures giriş sinyali değil |
| **B2** | OKX + Kraken USDC/USDT gerçek emir defteri ekranı | Stablecoin ve mekânlar arası likidite kayması | Net ücret, senkron yürütme, transfer, iki taraflı erişim yok |
| **T0** | ABD Hazine referans getirileri | Günlük/haftalık makro risk rejimi hipotezi | Repo oranı, kupon/ISIN/teminat/dirty price değil |
Modül kaynaklarının anlık kullanılabilirliği `makine-core/site/data/support.json` çıktısından ayrıca doğrulanır; burada yazılı gözlem sayıları 18 Ekim örneğidir ve sonsuza dek geçerli değildir.

## Araştırma aileleri ve modül bağlamları
- **X1 Sessiz Birikim:** A3 fiyat yapısı + B1 funding/OI (OI yoksa hipotez bekler) + B2 likidite verisi; risk: yanlış erken alarm.
- **X2 İkinci Roket:** A3 sektör devamı + B1 kaldıraç baskısı + B2 spread; dikey yükselişi otomatik düşüş adayı saymaz.
- **X3 Sıkışma:** B1 gerçekleşmiş funding + ek doğrulanmış OI/likidasyon ihtiyacı + B2 likidite; iki yönlü risk, default WATCH/NO_TRADE.
- **X4 Domino Gecikmesi:** A3 sektör ilişkisi; A2/T0 yalnız hipotez; tarihsel korelasyon nedensellik değildir.
- **X5 Sahte Kırılım:** A3 fiyat teyidi + B1 pozisyon durumu + B2 spread/order-book; wash trading ve spoofing **yalnız şüphe** olabilir.
- **X6 Rejim Değişimi:** A1+A2+T0 ile genel risk ortamı hipotezi; eksik/yanlış zamanlı piyasa verisinden giriş yapılmaz.

## Çapraz İtiraz ve net değer
Her aday için olay fazı `QUIET, SPARK, RALLY, PULLBACK, SECOND_WAVE, BASE, BREAKDOWN`; üç ayrı alan:
1. **Fırsat ipucu:** hangi kapalı mum, hacim, ilişki gözlendi?
2. **İtiraz/Tuzak:** likidite, spread, squeeze, delisting, görünmeyen borsa saati, sahte istatistik, kalabalık korelasyon.
3. **Ekonomi:** USDⓈ-M 10x ana senaryo; maker/taker ücretleri ve slippage tahmini; funding, likidasyon/fiyat hareketi gerçek olmayan durumda `UNKNOWN`.

Örnek Binance USDⓈ-M USDT **Regular** maker %0.0200, taker %0.0500 (2026 kaynak, kullanıcı komisyon kademesi bilinmiyor); kaynak: https://www.binance.com/en/fee/futureFee . Güncel hesap düzeyine göre oranlar değişebilir. Ücret = pozisyon notionali × giriş ücret oranı + notional × çıkış ücret oranı; kayma ayrıca eklenir, funding ayrı bırakılır. USDⓈ-M ile COIN-M maliyet formülleri farklıdır: https://www.binance.com/en/support/faq/detail/98488a516eb84e3eb34605683dffd554 . Eğitimsel bir hesaplayıcı, gerçek emir kapasitesi veya tam net kâr değildir.

## Girdi yaşlandırma / kanıt protokolü
- Her modül kendi as-of damgası ve veri türüyle ayrılır; kapalı günlük hisse/Treasury değeri 1m mum seviyesinde teyit sayılmaz.
- Makale olay tarihi = işlem açılabilecek doğrulanmış canlı zaman değildir.
- Önceden seçilmiş fiyat tepe/dipleri stratejiye giriş eşiği olarak aktarılmaz.
- Yıllık en çok yükselen adayların seçimi survivor bias taşır.
- Yeni olay arşivi **append-only** kayıt üretir; sonraki yeniden sınıflama ayrı sürümdür.
- Karşılaştırma yapılacaksa kronolojik formation / değerlendirme ayrımı, enstrüman doğrulama, dönemsel likidite ve tamamlanmamış veriler için SKIP gerekir.

## Otonom arşiv, sınırlar ve yayın
- `scripts/uzayx_atlas_watch.py` ile `.github/workflows/uzayx-atlas-watch.yml`, GitHub Actions **saat başına bir** tetiklenmeyi hedefler (dakika 19, GitHub best effort; gecikme olabilir).
- Piyasa `scan_id` ve `finished_at_utc` geçerliliği yoksa arşive **STALE_NO_MATCHING** girilir; eski uyarılar yeni işlem gibi gösterilmez.
- MAKİNE altı modül kaynağı erişilebilir ve zamanlı ise `OBSERVATION_CONTEXT_ONLY` olarak eklenir. Erişim yoksa `UNAVAILABLE`.
- Atlas sembolü ile izlenen coin sembolü eşleşmesi **yeni kâr sinyali değildir**, sadece `historical_symbol_matches`.
- Yalnız `web/data/uzayx-atlas-watch-history.json` append edilir; V4 piyasa motoru, sanal kasa, ana strateji, açık pozisyonlar, ücret ve emir hesapları değişmez.
- Günlük öğrenme süreci `uzayx-learning.yml` hâlen ayrı ve kesintisizdir. Gece boyu bir ChatGPT oturumu çalıştırılmaz; *GitHub planlı işler* zamanları geldiğinde çalışır.

## UX ilkeleri
Mobil 760px altında 5 erişilebilir sabit tab: İzle, Grafik, Kasa, Atlas, Menü. Menüden tüm 7 eski bölüme erişim devam eder. PWA manifest ve basit service worker statik arayüzü önyükler; **canlı veri cache'lenmez**. Masaüstünde genişletilmiş profesyonel çalışma yüzeyi. Onaylı logo `web/assets/uzayx-logo.svg` aynen korunur. Açık pozisyonlar ana sayfada görünmeye devam eder.

## Versiyon / gelişim
- V4.0: ana sanal tarama ve geçmiş arşivi — değiştirilmedi.
- **V4.1:** tarihsel Yanardağ Atlası araştırma ekranı + X1–X6 ve A1–T0 katkı haritası + 10x ücret laboratuvarı + mobil alt gezinme ve PWA manifest + saatlik salt-okunur arşiv.
- **V4.2 (hipotez):** gerçek kapalı mumdan temellenen olay anı eşlemesi, hareket ömür döngüsü ve veri kısıtları.
- **V4.3 (hipotez):** OI/orderbook/perp basis, futures tradability geçmişi ve ücret/likidite temelli NO_TRADE.
- **V4.4 (hipotez):** Out-of-sample modül ablation ve yanlış alarm maliyeti; kanıt gelmeden strateji kazancı iddia edilmez.

**Not:** Bu revizyon için ayrıca backtest/pen-test çalıştırılması istenmedi; var olan otomatik CI akışlarının GitHub'da tetiklenmesi bu tercih kapsamında manuel test komutu değildir. Onay ve hesap yetkisi olmadan gerçek para emri gönderilmez.
