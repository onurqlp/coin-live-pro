# COIN.LIVE PRO 2.0 — 7 Günlük Merkezi Pilot

**Web:** https://onurqlp.github.io/coin-live-pro/  
**Rapor:** https://docs.google.com/spreadsheets/d/17xCk7i_F3XRGzyts1EF89vfrPiAUPbnEqATAM4fj9nA/edit  
**Model:** `2.0.0-mtf-pilot` + `2.0.0-paper-pilot`

> Bu bir **ileri dönük, sadece sanal araştırma** pilotudur. Gerçek alım/satım emri, finansal API anahtarı, Telegram/WhatsApp/e-posta veya pilotta bildirim yoktur. Getiri ve başarı garantisi yoktur.

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
