
> **Operational guide (17.10.2026):** [COIN.LIVE 4.03 Operations & Recovery](docs/OPERATIONS.md). The separate read-only Quant evidence report is at `web/data/ops-report.json` after the next successful market run. No real orders.

# COIN.LIVE PRO 4.0 — 90 günlük gözlem

**Üretim:** [COIN.LIVE PRO 4.0](https://onurqlp.github.io/coin-live-pro/). Canlı V4 araştırma sistemi otomatik veri biriktirir; işlem yapmaz.

**Sürüm yetkisi:** Yayınlanan ana sürüm `web/release.json` içindeki `product_version` alanında tutulur ve **yalnızca kullanıcının onayıyla değişir**. Her geliştirici güncellemesinde `updated_at_utc`, `release_id` ve kısa değişiklik notları güncellenir; kullanıcı sürümü otomatik arttırılmaz. Ana sayfa ve alt bilgi bu kaydı gösterir. Piyasa tarama zamanı kod yayın zamanından ayrıdır.

**Global saat ve anomali araştırması:** Hesaplamaların tek otoritesi UTC ve OKX tarafından kapanışı doğrulanmış 5m/15m/1H/4H mumlarıdır. Tokyo/Londra/New York yaklaşık etkinlik pencereleri ayrı olarak DST-aware gösterilir; kripto 24/7 açıktır, sabit bir "manipülasyon saati" varsayılmaz. Yeni `archive/v4-anomaly-study.json` 90 günlük UTC saat histogramını yalnız **tekil 5m kapanışları** üzerinden biriktirir; oranı göstermek için saat başına en az 40 gözlem ve 3 farklı gün gerekir. Dönen aday havuzunun seçim yanlılığı açıkça belirtilir. **Anomali indeksi manipülasyon kanıtı, gerçekleşme olasılığı veya sinyal puanı değildir**; mevcut V4 skoru, sanal emir ve risk eşiği aynen kalır.

**Deep Freeze / tarayıcı:** Veri ve muhasebe sunucu tarafında `archive/` ve `web/data/` altında. Tarayıcıda localStorage/sessionStorage/IndexedDB kalıcı durumu yok; URL/ekran yalnız görüntüleme için.


- 90 günün başlangıcı V4 sanal kasa kayıt saatidir (16 Ekim 2026); ilerleme sitede gösterilir. 90 gün tamamlandığında geçmiş silinmez; sonuçlar incelenir.
- Ana radar: üstte **GÖZ ÖNÜNDE** ve **HAREKET**; altta **İZLE + aynı sayfada 4H grafik**. Eski 4 kutulu sayaç geri getirildi: toplam OKX USDT paritesi, tekil LONG/SHORT pariteleri ve son merkezi tarama saati. Strateji sayısı coin sayısı gibi gösterilmez. Kıvılcım seçimi aynı sayfada grafiği değiştirir; özel Grafikler sekmesi isteğe bağlı tam ekran/piyasa tablosu olarak korunur.
- V3.1 günlük/4H sinyalleri ve 7-zaman-dilimli teknik raporlar silinmeden kapalı **Teknik analiz ayrıntıları** altında.
- 10.000 USDT kasanın tamamı sanaldır, V3 100 USDT verileriyle birleştirilmez. Kullanıcıya bildirim veya gerçek otomatik emir yok.
- Performans raporu varsayılan **90 gün**; 7/14/30 günlük kısaltmalar seçilebilir. Forward-only ölçümler örneklem/numune yetersizliğini ve veri boşluklarını ayrı işaretler.
- 5 dk kontrol ve GitHub schedule hedefleri garanti değildir; GitHub + Google Apps Script bağımsız kontrollerini açık tut. 90 gün işletim kararı, bir uptime SLA değildir.

## Önceki V3.1 teknik altyapı (korundu)


Canlı site: https://onurqlp.github.io/coin-live-pro/

**Tek aktif model:** `3.0.0-market-quotes` → `3.0.0-mtf-swing` → `3.0.0-htf-sparks` → `3.0.0-forward-observation` ve ayrı `3.0.0-paper-swing`.

## Sürekli radar, daha sıkı quant incelemesi (16 Ekim 2026)

- Kıvılcımlar **bir sonraki taramada listeden kaybolmaz**. `archive/swing-active-ledger.json` sunucular arası kalıcı listeden önceki adayları tekrar taramaya öncelikli dahil eder; WATCH gözlemleri **24 saat**, TEYİT görmüş gözlemler **48 saat** tutulabilir. Bu süreler bir kazanç/işlem garantisi değil, gözlem penceresidir.
- Her satır ilk görülme, son incelenme ve durumunu gösterir: **FRESH** (bu taramada veriyle kontrol edildi), **RECHECK_PENDING** (bu tur ölçülmedi; yalnız geçmişteki İZLE durumu gösterilir), **INVALIDATED** (makro yön/risk/setup bozuldu; 6 saat uyarı olarak tutulup arşivlenir). Eski TEYİT asla güncel giriş sinyali diye taşınmaz.
- **TEYİT**, canlı fiyatın 4H eşiğine yaklaşmasına değil, kapanmış **4H mumunda kırılım**, 1D/4H/1W uyumu, güncel kapanmış 1H/15m/5m teyidi, RSI(14), MACD(12/26/9), ADX(14), kapanmış mum göreli hacmi, spread/likidite ve yapı-risk kontrollerine bağlıdır. İZLE daha gevşek ama yine 1D/4H tabanlıdır.
- **Birikim / yanardağ gözlemi:** Bollinger bant sıkışması, göreli hacim canlanması ve MACD yönü izlenir; bu kesinlikle fiyat patlaması tahmini veya TEYİT değildir. Yukarı/aşağı iki yönde eşdeğer kurallar uygulanır.
- **Şüpheli hareket riski:** kapanmış mumda fitil + yüksek hacim, geri dönmüş kırılım, fonlama, kaynağı/yaşı belli OI değişimi ve tek karelik ilk 5 seviye emir defteri dengesizliği kontrol edilir. Bu gözlemler **manipülasyonun ispatı değildir**. Yoksa veri uydurulmaz.
- Sinyal puanı istatistiksel kazanma olasılığı değildir; gerçek alım/satım izni, işlem emri, kullanıcıya bildirim veya otomatik para transferi yoktur. 7/14 gün raporları ileriye dönük kapanmış mumları izler.
- Yeni filtre etiketi `3.1-persistent-quant-20261016`. Önceki 3.0 olayları/sanal gözlemleri silinmez; önceden TEYİT edilmiş bir olay yeni quant standardına otomatik terfi ettirilmez.

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
