# UzayX / TURAN — 1 Kasım 2026 veri temelli günlük AR-GE notu

**Kaynak anı (UTC):** 2026-10-31 23:43:28 · **TR:** 2026-11-01 02:43:28.
**Ana kaynak:** `onurqlp/coin-live-pro:web/data/uzayx-pnl-report.json`.
**Kaynak tarama ID:** `5070378c4f31fe6bff6949a8`.
**Araştırma / muhasebe durumu:** `uzayx.pnl.ledger.v1`, `reconciled=true`, `no_real_orders=true`, `not_realized_exchange_pnl=true`.
**Ürün sürümü:** 4.13; rapor piyasa verisi çıktısıdır, sürüm yayın tarihine karıştırılmamalıdır.

## Gözlenen sanal durum

| Metrik | Değer |
| --- | ---: |
| Başlangıç model kasası | 10.000,00 USDT |
| Model özkaynak | 9.459,33 USDT |
| Toplam model PnL (açık+kapalı) | -540,67 USDT |
| Gerçekleşen model PnL | -545,16 USDT |
| Açık model PnL | +4,49 USDT |
| Toplam model kapanışı | 713 |
| Açık model pozisyonu | 9 |
| Son 48 saat net model kapanış PnL | -184,97 USDT |
| Son 48 saat kapanış adımı | 199 |
| Son 48 saat pozitif / negatif çıkış | 118 / 81 |
| Son 48 saat SHORT / LONG PnL | -185,38 / +0,41 USDT |
| Son 48 saat STOP çıkışı PnL | -519,57 USDT |

**Bulgular:** Yaklaşık %59,3 pozitif kapanış oranına rağmen net sonuç negatiftir. Pozitif/negatif adedi tek başına kârlılık ölçüsü değildir. STOP çıktılarının zarar ağırlığı ve SHORT örnek ağırlığı incelenmelidir. Bunlar **betimleyici ilişkiler**; manipülasyon, kusurlu stop parametresi, ters yön kârlılığı veya nedensel kök nedeni ispatlamaz.

**Sınırlar:** Binance ile OKX fiyat/kontrat farklılıkları, komisyon modelinin gerçek hesabı temsil etmemesi, fonlama ve kesin likidasyonun modellenmemesi ve küçük/bağımlı örneklem nedeniyle gerçek yürütülebilir net PnL bilinmiyor. Gerçek emir açılmıyor.

## Sonraki AR-GE için doğrulama sırası

1. 1H kapalı mumları ve sıra/zaman kaydıyla STOP/TP maliyetlerini, fonlama ve spread duyarlılığını ayrı bir ileri `paper` deneyde ölç. Ham geçmişi ve strateji kuralını değiştirme.
2. SHORT ve LONG gruplarını ayrı piyasa rejimi, sembol, volatilite ve stop mesafesi içinde karşılaştır. Tek bir olumsuz 48 saati genel kurala dönüştürme.
3. 200 TURAN kimliğinin **tam kapsama** kayıtları ile başarılı `EXACT` atıfları ayrıştır; kaynağı bloklu veya örneksiz stratejiyi kazanan ilan etme.
4. STOP sonrası devam/geri dönüş hipotezini **yalnızca ileri tarihli kapalı mum replay** ile, bağımsız dolum, komisyon, kayma, funding ve out-of-sample penceresi altında sınamadan ters yön PnL yazma.
5. 7/14/30/90 günlük ileri kayıtlarla zarar, risk, örneklem, kalibrasyon ve strateji ailelerini karşılaştır; seçilim yanlılığına karşı tarihe göre ayrı holdout dönemi tut.
6. GitHub Actions `schedule` ile `workflow_dispatch` olaylarını ayrı göster. `DEGRADED_SCHEDULE_GAP` olduğunda kaynak zamanını kontrol et; gecikmiş fiyatı güncel fırsat gibi yayımlama.

## 4.13 kod değişiklikleri

- Ana ekranda son 48 saat sanal net, yalnız **SHA sabit**, **en fazla 25 dakika eski**, **aynı tarama**, **uzlaştırılmış**, **paper-only** kayıtlarla gösterilir; eksik veri varsa değer gizlenir.
- Artı/eksi kapanış adedi net tutarın yanında sunulur; yüzeysel başarı oranıyla net PnL karıştırılmaz.
- TURAN sabit/eski sürüm etiketi ve PWA sürüm tanımı yenilendi.
- Stratejiler, geçmiş kasa, market iş akışı ve gerçek emir politikası değiştirilmedi.

Bu rapor zaman damgalı **tek bir anlık kesit**tir. Yeni canlı taramaların yerini almaz.
