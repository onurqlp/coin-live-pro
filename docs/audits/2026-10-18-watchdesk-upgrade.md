# UzayX · İzleme Terminali ve Sanal Kasa (18.10.2026)

## Değişmez kurallar
- Önceden onaylanan logo `web/assets/uzayx-logo.svg` korunur; yeni logo üretilmedi/değiştirilmedi.
- Yeni depo açılmaz. `onurqlp/coin-live-pro` ve `/coin-live-pro/uzayx/` yayın yolu korunur.
- V4.03 üretim stratejisi, gerçek emir kapalı politikası, ana V4 ve deney kıvılcım kasaları, tarihsel ledger kayıtları **değiştirilmedi**.
- Eski/değerlendirilmemiş gözlemler asla yeni işlem fırsatı olarak gösterilmez.

## İzleme ekranı
- Tek görünümde hareketlenen/izlenen/kıvılcım sınıfları, arama, sonuç denetimi, kapanmış mum grafiği, stop/TP ve RSI/MACD özetleri.
- Yön ve araştırma seviyesi, `v4-early.json` + `v4-radar.json` aynı `scan_id` temelinde, 25 dakikadan eski kaynak reddedilerek okunur.
- Erken araştırma sınıflandırması kullanıcı görünümü içindir: `ISIK_GUCLENIYOR` hareketlenen, `ERKEN_SINYAL` izlenen, `KIVILCIM` ilk kıvılcım. Bunların **hiçbiri teyitli trade sinyali değildir**.
- Parite seçimi ana sayfadan ayrılmadan grafiği değiştirmelidir. 1H erken gözlem eşiği ayrı işaretlenir; 4H kapanmış mum eşiğiyle karıştırılmaz.
- Grafik, doğrulanmış aynı-commit chart-pack/MTF kapanmış mumları ile sınırlıdır; grafik bulunmadığında başka coinin grafiği gösterilmez.
- Veri kontrolü en fazla dakikada bir, bağımsız tarama GitHub cron best effort ve her 5 dakikada kesin çalışma garantisi yoktur.

## Sanal kasa
- `v4-spark-paper.json` toplamdaki sanal bilet sayısı, açık/gelecek mum bekleyen/kapanan durumları, realize ve mark-to-market özkaynak.
- Ekrandaki `recent_tickets` bütün geçmiş biletler değil, yalnız son örnektir; toplam sayı `all_events_count` ve summary counts ile kaynaktan alınır.
- Yeni kıvılcımların sanal niyet olarak kaydedilmesi mevcut V4 motorunun davranışıdır. Her sinyalin hemen açık pozisyona dönüştüğü **iddia edilmez**.
- Kullanıcı pozisyonunu seçince sanal fiyatı, kapanış-mumuna dayalı tahmini giriş, mark, stop, TP, gerçekleşen ve açık PnL, varsa aynı-scan grafik görülebilir.
- `daily.days` tablosunun mevcut olduğu günlerden günlük realize sanal sonuç grafiği oluşturulur; eksik zaman günleri tamamlanmaz.
- Kasa kaynağı güncel değilse görünür uyarı gösterilir.

## Tarihsel arşiv ve motor
- Eski radar olaylarını eski `v4-history-index.json` üzerinden sadece arşivde, istem üzerine yükle; geçmiş kohort tabloları kapanmış detayda.
- Yeni JSON/ZIP arşivleri tarayıcıda analiz edilir; mevcut kaynaklara yazılmaz.
- Sonuç güncelle / motor denetle düğmeleri gerçekten kaynak denetimini yapar. Motoru çalıştır düğmesi kimlik doğrulaması gerektiren GitHub Actions ekranına götürür; kamuya açık arayüzden uzaktan workflow tetikleyicisi açılmaz.
- Gerçek Binance emir yetkilendirmesi ve canlı para kullanımı **yoktur**.

## Uygulama kanıtı
- Değişen ana dosyalar: `web/uzayx/index.html`, `app.js`, `charts.js`, `watch.js`, `portfolio.js`, `archive.js`, `desk.css`.
- Regresyon kontrolleri: `tests/uzayx-watchdesk.test.cjs`, `tests/uzayx-browser-smoke.cjs`, mevcut kalite ve mobil/masaüstü smoke workflow'ları.
- Yayın sonrası canlı URL: https://onurqlp.github.io/coin-live-pro/uzayx/
