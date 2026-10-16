# COIN.LIVE PRO 3.0 — 4H/Günlük Swing, Giriş Kalitesi ve İleriye Dönük Sonuç Kontrolü

**Web:** https://onurqlp.github.io/coin-live-pro/  
**Rapor:** https://docs.google.com/spreadsheets/d/17xCk7i_F3XRGzyts1EF89vfrPiAUPbnEqATAM4fj9nA/edit  
**Model:** `3.0.0-mtf-swing` + `3.0.0-htf-sparks` + `3.0.0-forward-observation`; eski 2.x sanal pilot ayrı.

> Bu bir **ileri dönük, sadece sanal araştırma** pilotudur. Gerçek alım/satım emri, finansal API anahtarı, Telegram/WhatsApp/e-posta veya pilotta bildirim yoktur. Getiri ve başarı garantisi yoktur.



## 3.0 — Kontrollü giriş ve gerçek ileriye dönük gözlem (16.10.2026)

- Kapanmış 1D+4H yön uyumu şartı, 1W/1H bağlamı, 15m teyidi ve 1m ek kontrol korunur. LONG ve SHORT eşit işlenir. Breakout seviyesi 4H barlarından gelir. Fiyat, kırılımın yönünde 4H ATR'ye göre fazla uzaklaşmışsa aday **İZLE** olur; pahalı/geç girişi sırf momentum var diye **TEYİT** saymayız. Bu filtre test edilmiş bir üstünlük iddiası değildir.
- 12 saatte bir aynı parite/yön/aşamada yeniden üretilen kıvılcımlara ayrı başarı yazılmaz. Model 3.0 yeni olayları sıfırdan izlemeye başlar; 2.4 arşivi aynen saklanır.
- `engine/forward.py` **yalnız 3.0 sonrası kaydedilen olayları**, olaydan sonra başlayan **kapanmış 4H mumlarıyla** izler. Hedefi önce görmek = `FAVORABLE_1R`, ters hareket = `ADVERSE_1R`, aynı mumda ikisini görmek = `AMBIGUOUS`, eksik mum = `DATA_GAP`, süre dolumu = `EXPIRED`. Bunlar piyasa yönü gözlemleridir; **gerçek emir, gerçekleşmiş kazanç, isabet garantisi veya sanal fill değildir**.
- 7/14 günlük ileriye dönük raporda bütün durumlar ayrılır. Gözlenen yön oranı ancak en az 30 net yön olayı sonrasında açıklanır; aksi durumda boş bırakılır. Bu oran bile kalibre edilmiş kazanma olasılığı değildir.
- GitHub cron hâlâ best-effort; bağımsız zamanlayıcı kanıtı oluşmadıkça '24/7 garanti' denmez. `workflow_dispatch` bağlantısı yalnız kullanıcının GitHub'da elle başlatmasına yönlendirir.

## 2.4 — Önceki sürüm

- Kapanmış **1D + 4H** aynı yönde olmadıkça LONG/SHORT kıvılcımı üretilemez. Toplam puan: **1D %36,4; 4H %36,55; 1W %15,6; 1H %6,45; 15m %3,5; 5m %1,5**. Haftalık uyum 3–7 günlük **1D** grafik, aksi 1–3 günlük **4H** grafik doğurur.
- **TEYİT:** kapanmış 1H+15m uyumlu, risk puanı <35 ve genel puan ≥67. 1m/5m ek kontroldür; yokluğu temel sinyali iptal etmez; eksik veriye ayrı `NO_HISTORY` atanır.
- Radar ana ekranda seçilen coinin 1W/1D/4H/1H/15m/1m grafikleri tek dokunuşla açılır; 2.3 verileri yeni tarama tamamlanana kadar okunabilir. Başarı olasılığı ya da gerçekleşmiş kazanç iddiası yoktur.

## 2.3 — Önceki HTF sürümü (arşiv)

- **Yeni kanonik kıvılcım verisi:** `web/data/swing-radar.json`. Kapanmış **günlük (1D) + 4 saatlik (4H)** eğilim aynı yöne bakmalı; şüpheli yapı/risk filtresi geçilmeli. 1m/15m hareketleri kendi başına kıvılcım üretmez.
- **Haftalık (1W) uyumu varsa** 3–7 gün beklentisi ve varsayılan **1D grafik**; haftalık uyum yok ama 1D + 4H uyumluysa 1–3 gün beklentisi ve varsayılan **4H grafik**. Tahminler garanti değildir.
- **TEYİT:** Yalnız makro kıvılcım zaten oluşmuşsa 1H + 15m + 5m + isteğe bağlı erişilebilen *kapanmış* 1m yönleri beraber uyuştuğunda `CONFIRMED`; aksi `WATCH`. 1m erişilemiyorsa bilgi `NO_1M_CONFIRMATION` olarak saklanır, olumlu teyit uydurulmaz.
- **Ana sayfa:** kıvılcım listesi ve **tek paylaşılan, oynanabilir mum grafiği** yan yanadır. Kıvılcıma basınca coin ve doğal analiz periyodu otomatik seçilir. Grafikler sekmesi aynı grafiği genişletir; mobilde alt alta iner.
- **Geçmiş:** `web/data/swing-history.json` ileriye dönük, 14 gün kamuya açık arşiv; `archive/swing-sparks-ledger.json` 90 günlük merkezi denetim kaydı. Bu olaylar gerçek emir ve gerçekleşen kazanç olarak raporlanmaz; eski 15m V1 arşivi ayrı tutulur.
- **Kaynak:** `engine/mtf.py` + `engine/spark.py`; 4H/günlük sinyali belirler, mikro periyotlar yalnız durum yükseltir. Veri eski, kaynak bozuk veya model uyuşmuyorsa yeni kıvılcım kapatılır.
- **Yayın/cron:** GitHub Pages ve market işlerinin dağıtımı bir sıraya alındı. GitHub 15 dakikalık cron gecikmeleri mümkündür; gerçek periyodik `schedule` olayları kanıtlanana dek 24/7 garantisi verilmez.

## 2.2 son sürüm — 1–7 günlük SWING filtresi ve veri doğruluğu

- **Ana yön:** tamamlanmış UTC **1D %40 + 4H %34** (toplam **%74**); 12H %7,5, 1W %2,5, 1H %6, 15m %7, 5m %3. Kısa mumlar giriş/hacim zamanlaması içindir; tek başına swing kararı vermez.
- **LONG / SHORT eşit mantık:** 1D ile 4H yönü uyuşmazsa durum `WAIT_4H_1D`; işlem adayı değildir. 1–3 veya 3–7 gün beklenen gözlem süresi **öngörü**, sonuç garantisi değildir.
- **Yapısal risk:** kapanmış 4H/1D mumlarında tekrar eden aşırı fitil, 20 mum ortalamasına göre hacim sıçraması, ATR, 24s hareket, alış/satış spread, yeni listeleme/durdurulmuş kontrat ve **veri ulaşırsa** açık pozisyon seviyesi ile funding oranı izlenir. Açık pozisyon **değişimi** doğrulanmadıkça verilmez; risk puanı manipülasyonun ispatı veya kazanma olasılığı değildir.
- **Kripto filtresi:** açıkça hisse/ETF/emtia temalı USDT swapları yeni kripto taramasına alınmaz; eski denetim kayıtları korunur. `/api/v5/public/instruments` konumundan `state=live` ve listeleme tarihi mümkün olduğunda doğrulanır.
- **Sanal portföy:** 2.2 geçiş anından **sonra** gelen teyitler de sadece 1D+4H hizalı, yapısal risk eşiğini karşılayan `SWING_CANDIDATE` ise yeni sanal işleme dönüşür. Önceki 15m sanal pozisyonları ayrı `legacy` olarak ölçülmeye devam eder. Gerçek emir yok.
- **Google Sheets:** `GUNLUK_IZLEME` ve `PERFORMANS_GUNLUK` tarih anahtarı **metin** yapıldı; yinelenmiş 16 Ekim kayıtları temizlendi ve sonraki aktif Google senkronunda tek satır kaldığı denetlendi. Sheets arşivi GitHub analizinin yerine geçmez.
- **Sınır:** merkezi GitHub `schedule` için iki gerçek zamanlanmış koşu gözlenene kadar 24/7 düzenli tarama **kanıtlanmış değildir**. Manuel iş koşusu bu kanıt sayılmaz.

## Gerçekten çalışan yapı

1. **GitHub Actions:** `engine/collector.py` OKX'ten 100 USDT perpetual piyasayı alır; her tur 48 sembolü likidite/momentum/rotasyon önceliğinde dener. `analysis_attempted` ve `analysis_ok` ayrıdır. Mumlar OKX `confirm=1` gerektirir.
2. **Yedi zaman dilimi:** `engine/mtf.py` 1Wutc, 1Dutc, 12Hutc, 4H, 1H, 15m, 5m **kapanmış** mumlarını gerçek OKX verisinden inceler. Makro rejim (35%), momentum (50%), giriş bağlamı (15%) ayrıdır. NO_HISTORY sonuçları saklanır. Bunlar kalibre edilmiş kazanma olasılıkları değildir.
3. **Kritik 1m:** `engine/paper.py` sadece 5m mumda stop/TP sıralaması çakışınca 1m OHLC istemeyi dener. Aynı 1m içinde de çakışırsa `AMBIGUOUS` kalır.
4. **Sanal pilot:** İlk canlı çalışmada `archive/pilot-ledger.json` oluşturulur. Sadece pilot başlangıcından **SONRA** doğmuş teyitler giriş adayıdır. Fill/no_fill, stop/TP, veri boşlukları ve kanıt hashleri append-only günlüğe yazılır. Risk hedefi 1%/işlem, 3%/gün, en fazla 2 eşzamanlı sanal pozisyondur. 10x ve 15x aynı nominal riskte farklı teminat gerektirir. Toplam %0,15 varsayımsal ücret/kayma kullanılır; fonlama/tasfiye tam simüle edilmez.
5. **Denetlenebilir sağlık:** `engine/health.py` gerçek `GITHUB_EVENT_NAME` (`schedule` mi `push` mu) bilgisini ve atlanan cron aralıklarını kaydeder; `schedule_proven` ancak en az **iki** zamanlanmış çalışma görülürse true olur.
6. **Mobil gösterim:** `web/app.js` ve `web/pilot-ui.js` sadece merkezi JSON'u resmî radar/portföy olarak sunar; eski `live-radar.js` yalnız **elle kontrol** için korunmuştur, yerel geçmiş merkezî performansla karışmaz. Grafik 1m/5m/15m/1H/4H/12H/1D/1W zamanlarını destekler.
7. **Google Sheets:** `google-sheets.gs` mevcut dört tabloyu ve altı yeni pilot tablosunu idempotent olarak yansıtır. `GUNLUK_IZLEME` anahtarı UTC tarihe normalleştirilir. Google Apps Script kodunun güncellenmesi için **kullanıcının** mevcut `Kod.gs` içinde GitHub'daki yeni sürümü yapıştırması gerekir; GitHub'a commit tek başına Apps Script'i güncellemez.

### Çalıştırma ve dağıtım

- **15 dk cron hedefi (UTC):** 07, 22, 37, 52; GitHub Actions schedule **best-effort** çalışır. Push ile başarılı görünen job'lar zamanlayıcı kanıtı DEĞİLDİR.
- `.github/workflows/market.yml`: collector → MTF → paper → health → şema/tazelik doğrulaması → commit → Pages dağıtımı. Eksik sağlayıcı verisi *fail closed*.
- `.github/workflows/quality.yml`: Python, JS ve kural tabanlı testler.
- `.github/workflows/live-site-check.yml`: Canlı GitHub Pages JSON ve Chromium DOM doğrulaması.

**Doğrudan işlem:** [Actions → 15m Radar & Forward Archive](https://github.com/onurqlp/coin-live-pro/actions/workflows/market.yml) → Run workflow. Manüel çalıştırma `event=workflow_dispatch` sayılır, `schedule` sayılmaz.

### Merkezi arşivler

- `archive/pilot-ledger.json`: append-only `journal`, `chains`, `orders`; Git geçmişi ek yedek; 90 günden eski olaylar otomatik silinmez. Kamuya açık sadece anonim sentetik senaryo içeriğidir.
- `archive/scan-health.json`: 90 günlük gerçek scan/tetikleyici denetimi.
- `web/data/market.json`, `radar.json`, `history.json`, `reports.json`: önceki V1 panosu için korunur.
- `web/data/mtf.json`, `paper.json`, `health.json`: yeni pilot panoları.
- Google raporları: kullanıcı erişimli ikinci yedek. **Google Sheet verisi herkese açılmamalı.**

### Pilotun tamamlanması için henüz gereken kanıt

- [ ] Saatler boyunca gerçekten `schedule` tetikleyicisiyle çalışmış kayıtlar. Henüz sadece push testleri görülmüşse `SCHEDULE_UNVERIFIED` doğru statüdür.
- [ ] En az 7 tam gün ileriye dönük sinyal/sonuç ve istatistiksel örnek oluşması.
- [ ] Düşük veri kalitesi / eksik 5m / 1m sırası / NO_FILL olaylarının sahada doğrulanması.
- [ ] GitHub cron güvenilirliği yetersizse ikinci bağımsız zamanlayıcı veya barındırılan worker kurulması; ücretsiz GitHub Actions için tam dakikasında 24/7 garanti edilmez.
- [ ] Google `google-sheets.gs` yeni kodunun kullanıcı tarafından Apps Script'e alınması ve ilk `installCoinLivePro` çalıştırılması.

### Değişim ve geri alma

Modeller `model_version` altında tutulur. Önceki 14 günlük arşiv silinmez. GitHub commits sayesinde dosyalar istenirse belirli bir commit'e geri döndürülür. Yeni pilot `pilot_started_at` tarihinden öncesini sanal alım yapılmış gibi saymaz. Raporlarda `ESTIMATED`, `NO_HISTORY`, `NO_FILL`, `AMBIGUOUS`, `DATA_GAP` durumları ayrı sınıflandırılır.

**Resmî teknik kaynaklar:** [OKX v5](https://tr.okx.com/docs-v5/en/) · [GitHub schedule sınırlamaları](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).


## Durum ve 24/7 çalışma kanıtı (16.10.2026)

- Kaynak kodda 7TF makro/radar + kritik 1m + merkezi anonim sanal portföy mevcut; merkezi veriler GitHub JSON ve `archive/` altında tutulur.
- GitHub Actions `schedule` **henüz gerçek zamanlanmış çalışma olarak kanıtlanmadı**. `push` / manuel `workflow_dispatch` başarıları 24/7 operasyon kabul edilmez. Canlı kontrol: [health.json](https://onurqlp.github.io/coin-live-pro/data/health.json) -> `schedule_proven`.
- P0 veri sürekliliği / barındırma kararı: [GitHub issue #1](https://github.com/onurqlp/coin-live-pro/issues/1). Ücretsiz GitHub cron tam dakikasında garanti vermez.
- 16 Ekim'deki mükerrer Google `GUNLUK_IZLEME` satırları, `GUNLUK_YEDEK_1610` korunarak tek gün satırına indirilmiştir. `google-sheets.gs` normalizasyonu güncellendi, **Google Apps Script Kod.gs kendiliğinden güncellenmez**.
- Resmî merkezî defter ve 7 günlük pilot, otomatik arka plan taramasının gerçek çalışması ve veri devamlılığı doğrulanmadan 'kesintisiz' diye sunulmaz.
- Kullanıcı Render bağlantısını etkinleştirirse (ve ücretsiz/ücretli çalıştırma koşullarını onaylarsa) merkezi çalışan bir zamanlayıcıyı GitHub Pages'ten bağımsız barındırma opsiyonu değerlendirilebilir. Servis ücretini onaylamadan otomatik abonelik kurulmaz.
