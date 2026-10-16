# COIN.LIVE PRO 3.0 — Temiz Başlangıç

Canlı site: https://onurqlp.github.io/coin-live-pro/

**Tek aktif model:** `3.0.0-market-quotes` → `3.0.0-mtf-swing` → `3.0.0-htf-sparks` → `3.0.0-forward-observation` ve ayrı `3.0.0-paper-swing`.

## Sıkı 5 dakikalık sistem (16 Ekim 2026)

- GitHub Actions **5 dakikada bir tarama hedefler**; GitHub iş kuyruğu veya OKX gecikmelerinde garanti edilmez. 100 coinin fiyatı site açıkken 20 sn'de bir güncellenir, derin çoklu zaman dilimi taraması her çalışmada seçilmiş likit ve dönüşümlü coinlerde yapılır.
- TEYİT için kapanmış 1D+4H yönü, kapanmış haftalık 1W aynı yön, kapanmış ve güncel 1H/15m/5m teyitleri, **gerçekten aşılmış** 4H kırılım seviyesi, uzamamış fiyat, ≥76 puan, ≤24 yapı riski, günlük ≥40 milyon USDT hacim, bilinen ≤12 baz puan spread, aktif ve ≥30 gündür listeli kontrat gerekir. 1 dakikalık mum tek başına giriş yaratmaz.
- Koşulu karşılamayan ama makro yönü uygun aday İZLE kalır; otomatik kazanç veya işlem olasılığı iddia edilmez. Yeni filtre versiyonu: `3.0-strict-5min-20261016`, geçmiş gözlemler korunur.
- Google Apps Script'in **depo içindeki örnek kodu** 5 dakikaya ayarlandı. Kullanıcının Google hesabında kurulu 15 dakikalık tetikleyici kendiliğinden değişmez; şimdilik bağımsız yedek olarak çalışır. GitHub tarafındaki 5m hedef aktifleşir.
- 5 dakikada bir kontrol, her 5 dakikada mutlaka yeni kıvılcım oluşacağı anlamına gelmez. Veriler eskiyse eski kıvılcımlar yeni gibi gösterilmez.

## 3.0 veri ilkeleri

- Merkezi radarın kıvılcım üretmesi için **kapanmış 1D ve 4H** mumların yönü aynı olmalı. Haftalık (1W) trend bağlam ve hedef süre içindir. 1H/15m yalnız onay; 5m/1m yalnız ek giriş ve sıralama teyididir.
- Eski bağımsız **15 dakikalık sinyal üreticisi durduruldu**. Tarayıcıda çalışan eski 15m dosyası kaldırıldı; eski cihaz içi `clpro.local_events_v1` geçmişi sayfa açılınca silinir.
- `engine/collector.py` yalnız OHLC sinyal üretmeyen piyasa evrenini toplar. `engine/mtf.py` adaylarını eski mikro radardan değil **likidite, fiyat hareketi ve dönüşümlü kapsama** üzerinden belirler.
- Geçmiş yalnız `web/data/swing-history.json` içindeki **3.0** kıvılcımları gösterir. Yön performansı `web/data/swing-outcomes.json` dosyasından; yalnız **sinyal sonrasındaki kapanmış 4H mumları** üzerinde ölçülür. Aynı mumdaki hedef/stop çakışması belirsiz, eksik mum veri boşluğu sayılır.
- Eski aktif `web/data/history.json`, `radar.json`, `reports.json` dosyaları boş ve `retired=true` işaretlidir. **Yeni kod bunları okumaz veya tekrar doldurmaz.**
- 100 USDT sanal portföy 3.0'a sıfırlandı. `engine/paper.py` yalnız resetten sonra doğan `3.0.0-htf-sparks` **CONFIRMED** olaylarından ileriye dönük temsili 5m dolum denemeleri yapar. Gerçek emir yoktur.
- Önceden kaydedilmiş 3.0 olayları korunur. Önceki 2.x kıvılcımları 3.0 başarı ölçümüne **karıştırılmaz**.
- Yeni performansın yüzdesi 30 net ileriye dönük sonuç birikinceye kadar verilmez. Bu bile kalibre edilmiş kazanma olasılığı değildir.

## Çalıştırma ve yayın

`.github/workflows/market.yml`: fiyat evreni → kapanmış çoklu periyot → 1D/4H kıvılcımları → ileriye dönük 4H gözlem → 3.0 sanal portföy → sistem sağlığı → atomik doğrulama → GitHub Pages.

`.github/workflows/quality.yml`: Python ve JavaScript regresyon testleri.

`.github/workflows/live-site-check.yml`: gerçek site JSON, DOM ve bütün altı ekranı Chromium ile doğrulama.

[Manuel merkezi tarama](https://github.com/onurqlp/coin-live-pro/actions/workflows/market.yml) — **Run workflow**. Bu manuel çalışma, 15 dakikalık `schedule` otomasyonunun çalıştığının kanıtı değildir. GitHub cron best-effort; veri 25 dakika eskiyse kıvılcım kilitlenir.

## Silme kapsamı ve Google Sheets

- Mevcut GitHub Pages sayfası ve aktif JSON sinyal/radar/rapor dosyaları 3.0'a temizlenmiştir; **GitHub commit tarihçesindeki eski sürümler ayrı bir geçmiş olarak geri alınabilir durumdadır**. Tam tarihçe silinmiş gibi davranılmaz.
- Daha önce bağlanmış **Google Apps Script Kod.gs** ayrı sistemdir. GitHub'daki `google-sheets.gs` değişiklikleri oraya kendiliğinden aktarılmaz. Bu nedenle Google Sheets'teki eski satırlar, ayrı bir işlem yapılmadıkça kalabilir. Mevcut eski senkronizasyon kodu emekliye ayrılmış JSON'ları okuyacaktır; 3.0 raporunu Google'a aktarıyor diye varsayılmamalıdır.
- Önceki eski 15m test sonuçları ve tahmini getiriler 3.0 kârı olarak sunulmaz. Gerçek finansal emir, API alım/satım yetkisi ve 24/7 kesintisiz veri garantisi yoktur.

## Sürüm 3.0

Bu sürüm mevcut `onurqlp/coin-live-pro` deposunun temiz başlangıcıdır. Yeni repo veya ikinci alan adı açılmamıştır.
