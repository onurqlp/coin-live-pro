# UzayX / COIN.LIVE — Kanıta dayalı güncelleme (18 Ekim 2026, UTC)

## Kaynak kimliği ve kapsam
- Kod deposu: https://github.com/onurqlp/coin-live-pro ; bu taramadaki HEAD `118ef36280f0a284b46947f9dd51887e281aefd4`.
- Ana V4 kanıt: `web/data/ops-report.json` generated `2026-10-18T17:54:42.460098+00:00`, source scan `b2707794a3815b9791c8000e`; `web/data/health.json` `17:54:42+00:00`. Denetim kaynağı anlıktır; yeni tarama geldiğinde güncellik tekrar kontrol edilmelidir.
- Eski karşılaştırma: `web/data/uzayx-lessons-history.json` içindeki 2026-10-18T14:19:57Z append-only kaydı; 18 Ekim devir paketleri.
- Destek kaynakları: `onurqlp/makine-core/site/data/coinlive-support.json` (`16:36:24Z`), `onurqlp/alti-quant-lab/site/report.json` (`16:23:20Z`).
- V5 staging `/api/snapshot` HTTP 200 / `/api/overlay` HTTP 200; overlay durumu STALE (gözlenen ageMinutes 84.53). `/api/health` 404: deploy sağlık endpointi olarak tanımlanmamış, erişilebilirlik testi yerine kullanmayın.
- Drive kontrol: `UzayX | Kontrol Merkezi` (https://docs.google.com/spreadsheets/d/1Il41PLFFpJtXXDwfRx4F7cgXboCNBRON-0jvgLnsUMo/edit) son kayıt `17:54:42Z`, 0 işleme uygun; Drive son düzenleme `18:01:44Z`. Excel/Sheets takip sayfaları muhasebe kaynağı değil, salt-okunur / farklı güncellikte özet olabilir.

## Doğrulanan sayılar (yalnız sanal / OKX kaynaklı)
| Ölçüm | Sonuç |
|---|---:|
| Ana V4 sanal kasa / gerçekleşmiş ana emir | 10.000,00 USDT / 0 |
| Ayrı kıvılcım deneme kasası özkaynağı | 10.013,20876 USDT |
| Deneme bileti / tamamen kapanan / açık | 1.013 / 740 / 271 |
| Kapanan kazançlı / kayıplı / gözlenen pozitif payı | 289 / 451 / %39,05 |
| Bütün biletlerde realizasyon (kısmi çıkışlar dahil) | +3,10889 USDT |
| Tamamen kapanmış biletlerin realizasyonu | -14,36160 USDT |
| Açık / diğer kapanmamış biletlerde önceden gerçekleşmiş kısmi çıkışlar (aritmetik fark) | +17,47049 USDT |
| Açık işaretleme / realize olmamış tahmin | +10,09987 USDT |

**Mutabakat:** `-14,36160 + 17,47049 = +3,10889`; `10.000 + 3,10889 + 10,09987 = 10.013,20876`. 17,47049 ayrı kasa ya da fazladan kâr değil; tam kapanmayan biletlerde gerçekleşmiş kısmi çıkışların toplu farkıdır. Raporda iki toplamın doğrudan karşılaştırılması yanlış bir muhasebe alarmına yol açar. Yeni `scripts/quant_report.py` alanları, aynı `scan_id`, 740 CLOSED sayısı eşleşmesi ve sonlu sayılarla doğrulandığı takdirde farkı açık gösterir; uyuşmazlık halinde alanı null ve durumu doğrulanmamış gösterir. Veriler/ledger değiştirilmez.

## Ne öğrendik?
- **LONG**: 130 tamamlanmış / 13 pozitif / 117 negatif, %10,0 gözlenen pozitif pay, toplam **-18,83732 USDT**.
- **SHORT**: 610 tamamlanmış / 276 pozitif / 334 negatif, %45,25 gözlenen pozitif pay, toplam **+4,47573 USDT**.
- **GELDİ otomatik giriş**: 101 tamamlanmış, 28 pozitif, 73 negatif, **-3,616 USDT**. Kısa vadede sınıf etiketi istatistiksel başarı kanıtı değil.
- Arşivin 14:19 UTC kaydında henüz 620 kapanış varken SHORT kohortu **-7,36615 USDT** idi; 17:54 UTC'de 740 kapanışla **+4,47573 USDT**. Tarihsel grup sıralamasının birkaç saat içinde değişebilmesi, tek kısa dönemden üstünlük ilan etmeyi sakıncalı kılar.
- Sinyal skorları kazanma olasılığı değildir. Ücret/kayma tahmindir, funding/likidasyon ve Binance ile OKX olası kotasyon farkı eksik olabilir. Gerçek para sonuçları veya kripto stratejisinin gelecekte beklenen getirisi kanıtlanmış değildir.

## Tersini yapsaydık?
1. **Sadece LONG kohortunu geriye dönük elerseydik**: aynı 740 kapanmış olay kümesinde -14,36160 yerine yalnız SHORT kalan olayların +4,47573 USDT toplamı görünürdü; aritmetik fark +18,83733 USDT (yuvarlama). Bu bir *geriye dönük dışlama hesabı*, işlem yapılan sermaye/slot tahsisinin yeniden simülasyonu değildir; geleceğe genellenmez.
2. **Tüm LONG'ları SHORT'a, SHORT'ları LONG'a çevirseydik**: doğrulanabilir karşı sonuç **YOK**. Ayrı giriş zamanları, mum sırası, stop/TP, iki yön maliyeti, fonlama, slippage ve yürütülebilir likiditeyle önden tanımlı replay olmadan ters PnL = -orijinal PnL kabul edilemez.
3. **GELDİ'yi tek başına otomatik işlem yapsaydık**: kapanmış sanal örnek ortalaması negatiftir; gerçek başarı veya gelecekteki zarar sınırı olarak yorumlanamaz.

## Manipülasyon ve saha riski
- Altcoin kaldıraçlı açık pozisyon yoğunlaşması ve fonlama dengesizliği, short/long sıkışması olasılığını artırabilir; fakat elde emir-defteri zaman dizisi, karşı borsa fiyatları, işlem kimlikleri ve diğer deliller olmadan belirli bir parada manipülasyon yapıldığını söylemek mümkün değildir.
- MAKİNE altı modülün yalnız B1'i gözlem modundadır; A1/A2/A3/B2/T0 kaynak engelli. Fonlama verisi salt-okunurdur, gerçekleşebilir iki borsa arbitraj fırsatı değildir. Veri yoksa BLOCKED_SOURCE korunur.
- Kaynak geçmişi ilerledikçe V5 overlay STALE gözükebilir; gösterim kaynak yaşı ve SHA kontrolünden geçmeden işlem adayı olarak kullanılmamalıdır.
- GitHub Actions 5 dakikalık hedef best-effort; 15 gözlenmiş schedule çalışması otomasyonun varlığını gösterir, her 5 dakikada kesintisiz veri garantisi vermez.

## Bu güncellemedeki sınırlı uygulama / güvenlik rayları
- `scripts/quant_report.py`: tamamen kapanan ve açık/diğer tamamlanmayan biletlerin realize PnL ayrımı; güvenilirlik kontrolleri; veri şeması yalnız ek alanlarla genişler.
- `tests/test_ops_report.py`: senkron snapshot mutabakatını ve karışık `scan_id` durumunda başarısız doğrulamayı test eder.
- `archive/v4-spark-paper-ledger.json`, `web/data/uzayx-lessons-history.json`, sanal emir strateji parametreleri, gerçek emir yetkileri ve 4.03 ana kasa **değişmedi**.
- Üretime alma kriteri: kalite workflow'unun yeşil olması ve yeniden üretilen raporda `realized_reconciliation_verified=true`. Kısmi çıkışlar stop/TP yönetiminden bağımsız toplanmaz.

## Sıradaki kontrollü deney
- Her sinyale göre takvim-zaman sıralı, kapanmış mumlu karşıt yön ve "işlemi atla" challenger'ları kur; iki yön komisyon/kayma/funding ve likidasyon sınırı dahil. Eğitim/validasyon rejimlerini tarih olarak ayır ve purged walk-forward kontrolü uygula.
- Günlük kayıtları eski kaynak anlarını silmeden biriktir; uzun/short dengesini coin, piyasa rejimi, volatilite ve likiditeye göre bağımsız gruplarla ölç. Tek pazar rejimi ve örtüşen biletler nedeniyle bağımsız örnek sayısı 740 kabul edilmez.
- Drive'da otomatik yenileme tetikleyicisi / canlı kaynak güncelliğini hesaptan ayrı doğrula; yeni Sheets eski defter yerine resmi finansal kanıt sayılmasın.
- V5 eski preview'dan yeni UzayX marka koduna geçişi ancak canlı görünüm ve veri erişim testiyle; gerçek trade yetkisi açılmadan gerçekleştir.

Kaynak belgeler: https://www.okx.com/docs-v5/en/ ; https://github.com/onurqlp/coin-live-pro ; https://github.com/onurqlp/makine-core ; https://github.com/onurqlp/alti-quant-lab .
