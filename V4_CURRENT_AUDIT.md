# COIN.LIVE PRO — V4 Güncel Kod Denetimi (16.10.2026)

> **Gerçek kaynak:** `onurqlp/coin-live-pro` / `main` (inceleme tabanı: `67cb6af`; sonraki `main` commit `8ae84a9` yalnız otomatik üretilen JSON veri arşivlerini değiştirdi). Bu belge, daha önce yazılmış V4 raporundaki V3 için geçerli fakat artık giderilmiş eksikleri günceller.

## Zaten uygulanmış olanlar — yeniden yapılmamalı

- `engine/spark.py`: `archive/swing-active-ledger.json` ile kalıcı kıvılcım listesi; `FRESH`, `RECHECK_PENDING`, `INVALIDATED`, 24/48 saat yaşam süresi, 6 saat geçersiz işareti; yeniden ölçülmeyen eski teyit asla canlı teyit gibi sunulmuyor.
- `engine/mtf.py`: kapanmış mum verisinden RSI(14), MACD(12/26/9), ADX(14), BB sıkışma yüzdesi; anlık fonlama, OI ve ilk beş seviye emir defteri gözlemi.
- `engine/spark.py`: kapanmış 4H kırılımı, RSI/MACD/ADX, hacim, trend, likidite ve yapısal risk koşulları; sıkışma bir `WATCH` araştırması, zorunlu emir sinyali değil.
- `web/app.js`: kalıcı fırsatların gözlem durumu ve teknik verilerin arayüzde gösterimi; 8 grafik periyodu ve altı ekran korunuyor.
- `engine/forward.py` + `engine/paper.py`: ileriye dönük 4H sonuç kaydı ve 100 USDT sanal takip; gerçek işlem yok, eski sürümlerden sahte performans aktarılmıyor.
- `engine/mtf.py`: önceki anlık OI örneği 60–3600 saniye eskiyse koşullu yüzde değişimi hesaplanıyor. Bu **kalıcı 1H/4H OI seri takibi yerine geçmiyor**.

## P0 — İşleyiş ve güvenilirlik

1. **Hot-pool adaleti (bu PR'de düzeltildi).** Önceki sıralama `last_evaluated_at` değeri en *yeni* olanı yukarı taşıyordu. Faz A'da uzun süredir kontrol edilmeyen aktif kayıtlar önce seçilmeli. Yeni `select_candidates()` en eski kontrol zamanından başlayarak 8 hot slot, BTC/ETH benchmark, 4 likit, 3 momentum ve kalan döngüsel coin için kapasite ayırıyor. Aynı coin yalnız bir kez seçiliyor.
2. **Üretim CI koruması (bu PR'de düzeltildi).** Önceki `.github/workflows/market.yml` push filtresinde dal kısıtı bulunmuyordu; feature branch üzerinde `engine/**` değişikliği bile `checkout ref: main` nedeniyle üretim verisi/yayın işini tetikleyebiliyordu. `push.branches: [main]` zorunlu.
3. **Cron kanıtı (hala açık).** `web/data/health.json` durumunda `SCHEDULE_UNVERIFIED` ve `schedule_proven=false` görüldü. GitHub Actions en iyi gayretle zamanlar; browser'ın 20 sn fiyat güncellemesi bu sınamayı geçirmez. Sistem sağlığını veri gecikmesi, gerçek `schedule` koşuları, API hata oranı ve tarama kapsamıyla ölçmeye devam et.
4. **Kaynak kümeleri eşzamanlılığı (açık).** `market.json`, `mtf.json`, `swing-radar.json`, `paper.json` ve `health.json` için ortak manifest/scan id ile uyum doğrulaması V4'te tamamlanmalı. Eski veri yeni teyit gibi sunulmamalı.

## P1 — Araştırma kapsamı ve sahte kesinlik engeli

5. **Altı ek bağımsız strateji** henüz yok: VOLUME_EXPANSION, OI_FUNDING, BREAKOUT_RETEST, REVERSAL, SQUEEZE, SHORT_BREAKDOWN. Mevcut `3.1` göstergeleri yeni bir *güçlendirilmiş tek swing filtresi*; 7 bağımsız motor varmış gibi raporlanmamalı.
6. **OI kronolojik seri** 5m/1H/4H için persist edilmeli; tek önceki scan ile delta bilinmiyorsa UNKNOWN. Derinlik 5-seviye tek snapshot manipülasyon kanıtı değildir.
7. **Fırsat olay günlüğü** lifecycle geçmişini (WATCH→CONFIRMED→WEAKENED→INVALIDATED) immutable olaylar halinde yazmalı; yeniden teyit/invalidasyon zamanları ayrılmalı. Aktif liste tek başına tam arşiv değil.
8. **Motor bazlı bağımsız forward raporu** 7/14/30/90 günlük karşılaştırmalı gözlem, MFE/MAE, hedef/stop belirsizliği, veri boşluğu ve maliyet varsayımları ile oluşturulmalı. Puan hiçbir koşulda kazanma olasılığı sayılmamalı.

## P2 — UI ve teslim

9. Mevcut altı sekme, yerel mum grafiği, mobil görünüm, hesaplayıcı, sanal portföy ve Google Sheets dosyaları eksilmeden kalacak.
10. Ana radarda coin / LONG-SHORT / motor / tetik koşulu / takip yaşı / son gerçekten taranan zaman / belirsizlik durumu özetlenmeli; detay panelinde teknik kanıtlar açılmalı.
11. Bağımsız motor karşılaştırması için `#laboratuvar` veya mevcut `#rapor` altında ergonomik modül planlanmalı; küçük mobilde yatay taşma ve sayfadan çıkmadan grafik geçişi kontrol edilmeli.
12. CI kalite kontrolleri, browser smoke, gerçek 360/390/430/768/1366/1920 ekran testleri, etiketli test raporu ve geri alma planı olmadan V4 yayınlanmış sayılmamalı.

## Bu PR'nin durumu

- Yalnız **Faz A sıcak-havuz seçim adaleti** ve **market workflow push dal koruması**, ilgili unit/Node regresyon testleri değiştirildi.
- `main`, Pages, veri arşivi, paper kayıtları, Google Apps Script kurulumu, eski API ve otomatik emir kapsamı değiştirilmedi.
- GitHub CI ve canlı arayüz doğrulaması henüz kanıtlanmadan **V4 bitti / testler yeşil** denilmez.
- Bu PR bir V4 geliştirme başlangıcıdır. Kullanıcı onayı olmadan `main` üzerine birleştirilmemelidir.
