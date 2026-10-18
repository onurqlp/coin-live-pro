# UZAYX — YENİ PROJE KOD MODU DEVİRİ
**Tarih:** 18 Ekim 2026
**Ürün:** UzayX · sade, profesyonel ve mobil öncelikli piyasa araştırma terminali
**Birincil depo:** https://github.com/onurqlp/coin-live-pro
**Arayüz kaynakları:** `web/uzayx/{index.html,styles.css,app.js,learning.js}`
**Arayüz adresi (GitHub Pages):** https://onurqlp.github.io/coin-live-pro/uzayx/
**Daha eski ekran:** https://onurqlp.github.io/coin-live-pro/
**Araştırma destek depoları:** `onurqlp/makine-core` ve `onurqlp/alti-quant-lab`
**Vercel proje:** `uzayx` / `prj_5H5XrY687BCIzPaQFX0kHWL9MIET`; eski V5 HTML'i hâlâ eski marka olabilir. Kontrol etmeden prod olarak sunma.

## 1. Hedef kullanıcı / vazgeçilmez UX
- Kullanıcıların teknik terim ya da yazılım öğrenmesi gerekmiyor.
- Birinci soru: "Veri güncel mi?" İkinci soru: "Giriş koşullarını karşılayan parite var mı?"
- Şu anki kaynakta `paper_entry_state=NOT_ELIGIBLE` olan adaylar işlem için uygun değildir. "LONG/SHORT" yalnız analiz yönüdür; Binance'da işlem emri değildir.
- Parite kartlarında yalnız sembol, yön, aşama, OKX fiyatı, stop senaryosu, varsa hedef ve "giriş teyidi yok" göster; teknik ayrıntıları açılır alana sakla.
- "Yapay zekâ", "öğrenme laboratuvarı", "hipotez" kavramlarını ziyaretçiye pazarlama yapma; finansal/operasyonel durum görünür olsun.
- Binance'a manuel geçişte OKX fiyatı ve Binance fiyatının farklı olabileceğini her zaman açık tut. Otomatik gerçek emir ve API anahtarı yok.
- Yanlış kesinlik ifade eden "garantili", "kesin kazanır", "başarı olasılığı %XX" etiketleri yasaktır; puan, kalibre edilmiş olasılık değil.

## 2. Öğrenme / araştırma gerçekten ne yapıyor?
- Günlük arşiv: `scripts/uzayx_learning_archive.py` + `.github/workflows/uzayx-learning.yml` → `web/data/uzayx-lessons-history.json`.
- Geçmişte negatif sonuç veren koşulları karşılaştırmaya aday olarak işaretler. Ters yönde gerçek PnL üretmez; `mirrorPnL: null`.
- Gerçek anlamda karşıt stratejiyi değerlendirmek için aynı sinyal anından sonraki kapanmış mumlarla bağımsız replay, ayrı giriş/stop/TP, ücret-kayma-fonlama, zaman sıralı doğrulama ve piyasa rejimi testi şarttır.
- Kullanıcının "sistem geçmişten ders çıkarsın" isteği kendiliğinden belirsiz kararlar almak anlamına gelmez. Mevcut şartlar içinde kanıtları kaydeden ve öneri sunan sistem kur; canlı stratejiyi otomatik tersine çevirme.
- Strict V4 kağıt portföy, ayrı kıvılcım kağıt portföy ve gözlemsel kohort sonuçlarını tek kasa/PNL gibi toplama.

## 3. Sürüm ve veri altyapısı
- Kaynakla çalışırken en son `main` commit'ini oku; veri dosyaları dakikalar içinde değişebilir.
- V4 piyasa json dosyaları `web/data/`; `v4-manifest.json`, `v4-radar.json`, `v4-paper.json`, `v4-spark-paper.json`, `v4-spark-review.json`, `health.json`.
- Kaynak `scan_id`leri eşleşmeden radar göstermek doğru değildir. Eski veya doğrulanmamış veri "CANLI" yazısıyla gösterilmez.
- OKX 5 dakikalık tarama GitHub Actions'da best-effort; kesin zaman garantisi yok. UI 5 dk bir tekrar kontrol eder.
- `.github/workflows/uzayx-validate.yml` ve `tests/uzayx-learning.test.cjs`: kaynak sözdizimi/araştırma mantığı kontrolü.
- `.github/workflows/market.yml`: asıl veri tarayıcı. Piyasa biriktirmeyi veya kağıt işlem ledger'ını kullanıcı açıkça istemedikçe durdurma/silme.
- Özgün `AGENTS.md` deposun geliştirme sözleşmesidir; önce oku.

## 4. Google Drive devri
**Yeni UzayX çalışma kitabı:** https://docs.google.com/spreadsheets/d/1Il41PLFFpJtXXDwfRx4F7cgXboCNBRON-0jvgLnsUMo/edit
- `DURUM`, `PARITELER`, `SONUCLAR`, `SISTEM`, `KULLANIM` sekmeleri. İlk kuruluş anındaki onaylı snapshot; otomatik canlı Google senkronu değildir.
**Eski tarihsel workbook:** https://docs.google.com/spreadsheets/d/17xCk7i_F3XRGzyts1EF89vfrPiAUPbnEqATAM4fj9nA/edit
- Tüm tarihi ve 15+ orijinal sekmeyi saklar. `UZAYX_SON_KAYIT` sekmesi manuel onaylı en son snapshot'ı verir. Eski veri bozulmasın.
- Apps Script eşitleme kaynağı: `integrations/google-v4-sync.gs`; kullanıcının Google hesabı yetkisi olmadan kurulu tetikleyici/deployment değiştirilemez. Kullanıcı yetki onayı vermezse "Google otomatik senkronu aktif" denilemez.
- `scripts/uzayx_google_export.py` her doğrulanmış taramada bir özet CSV üretir: `web/data/uzayx-guncel.csv`. Google `IMPORTDATA` harici erişim iznini masaüstü oturumunda isteyebilir.
- Yeni Sheets'e bir seferlik snapshot yazmak, otomatik yenileme sağlamak demek değildir. Açıkça ayır.
- Yerel Excel kopyası `UzayX_Kontrol_Merkezi_2026-10-18.xlsx` (eski konuşma çıktısı); gelecekteki kullanıcı isterse ayrıca sağlayabilir.

## 5. Yapılacak iş (sıralama)
1. GitHub Pages sitesini gerçek mobil/masaüstü tarayıcıda aç, verilerin aynı commit'ten gelip gelmediğini, kartların her ekran boyutunda okunaklı olduğunu doğrula. Proje sadece git push ile "yayında" ilan edilmez.
2. Gerçek Google Apps Script entegrasyonu için kullanıcı tek seferlik yetki verir/vermez mevcut senkronu çalıştırıp yeni Sheets dosyasına yazma yöntemini kalıcılaştır. Yetki olmadan eski Sheets'e manuel değil, şartlı ve açık biçimde devam et.
3. Karşıt strateji için offline/forward market replay araştırması yap; sonuç doğrulanırsa kullanıcıya basit "bekle / izle / kontrol" sınıflandırmasıyla sun.
4. Vercel (eski preview) entegrasyonunun kaynak/yayın adresi uyumsuzluğunu çöz; iki farklı "ana" uygulama yaratma.
5. Mobilde "önce durum → parite → Binance manuel teyit" akışını koru.

## 6. Kullanıcının yeni projede vereceği kısa başlangıç komutu
> UzayX projesinin kaynak noktası `onurqlp/coin-live-pro`. Önce `AGENTS.md` ve `docs/UZAYX_YENI_PROJE_DEVIR.md` dosyalarını oku; güncel kodu, piyasa arşivlerini ve Google bağlantılarını kontrol et. Mevcut kayıtları silme. Yeni özellikleri teknik terim yığını olmadan, telefon ekranında sade göster. Yalnızca gerçekten kullanıcı Google/Vercel hesabının onayını vermek zorundaysa tek işlem isteme; onun dışındaki kod, düzenleme, test ve yayın işini kendin tamamla.

## 7. Son dürüst durum
- GitHub kaynak dosyaları mevcuttur, kod kontrolleri yapılmıştır. GitHub Pages son dağıtımının gerçek mobil tarayıcı testi bu devirde tam olarak gözlemlenmemiş olabilir; yeni projede ilk teknik kontrol olarak ele al.
- Yeni Google Sheets dosyası oluşturulmuş ve okunarak doğrulanmıştır.
- Google otomatik Apps Script tetikleyicisi bu oturumda yetkilendirilip çalıştırılmamıştır.
- Gerçek Binance emir otomasyonu hiçbir zaman etkinleştirilmemiştir.

## 8. Google yeni dosya için hazır canlı senkron kurulum kaynağı
- **Apps Script kaynak:** `integrations/uzayx-google-sync.gs`
  https://github.com/onurqlp/coin-live-pro/blob/main/integrations/uzayx-google-sync.gs
- **Hedef:** `1Il41PLFFpJtXXDwfRx4F7cgXboCNBRON-0jvgLnsUMo`, sekmeler `DURUM`, `PARITELER`, `SONUCLAR`, `SISTEM`; eski Google çalışma kitabına hiçbir şey yazmaz.
- Kaynaklar `main` için aynı SHA'ya sabitlenir; `scan_id` uyuşmazlığında eski doğru değerleri korumak için hatayla durur.
- Tek insan işi: yeni Google Sheet'te **Uzantılar → Apps Script**, kodu ekle, **`installUzayXSync`** çalıştır ve Google izinlerini ver. Mevcut bağlı Google Drive API'si Apps Script proje kodunu veya zamanlayıcı tetikleyicilerini kuramadığı için bu yetki adımı bu görüşmede otomatik yapılamadı.
- Kurulumdan önce yeni kitabın verisi yalnız **18 Ekim 2026 14:54:40 UTC** anlık görüntüsüdür. Kurulumdan sonra `syncUzayX` zaman tabanlı 10 dakikalık yenileme için yapılandırılır; ilk gerçek senkronu ve tetikleyici sonucu yine doğrula.
- Ekran teknik profesyonelliği arka planda tutar; ziyaretçi için ilk soru "giriş teyidi var mı?"dır. `NOT_ELIGIBLE` kayıtları açık emir sinyali gibi sunma.
