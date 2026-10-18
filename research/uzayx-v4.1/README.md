# UzayX Atlas V4 — Tam Kaynak Arşivi

**Tam, kayıpsız Excel tablosu aktarımı:** `UZAYX_YANARDAG_ATLAS_V4_COMPLETE.json.br` (Brotli-sıkıştırılmış JSON). Yüklenen `UZAYX_YANARDAG_ATLAS_V4.xlsx` içindeki **altı veri sayfasının bütün sütunlarını ve 120 satırlık araştırma kayıtlarını** korur.

| Sayfa | Kayıt |
|---|---:|
| Olay_Atlasi | 31 |
| 50_Aday | 50 |
| Desenler | 12 |
| Bulgular | 10 |
| Kaynaklar | 36 |
| Grafik_Noktalari | 11 |
| **Toplam** | **150** |

**Kaynak XLSX SHA256:** `c5538743a2550bede523fa5ffd04aed833eff45865b55fa7947e46870d77d821`  
**Sıkıştırılmış arşiv SHA256:** `9508e1ff7c512316c9e60d47a081e8e7f3b1cd1b5e5ba96c4f8edacdd76505b2`

**Dışa aktarma:** Proje kökünde `node scripts/restore_uzayx_atlas_v4.cjs` çalıştırıldığında aynı veriler `research/uzayx-v4.1/export/` klasörüne, tam JSON ve altı CSV olarak geri çıkarılır. Orijinal çalışma kitabının biçimlendirmeleri, grafik nesneleri ve biçimlendirme özellikleri bu JSON kaynak aktarımına dahil değildir; satır/sütun değerleri dahildir. Özgün XLSX, kullanıcıya ayrı indirilebilir yedekte sağlanır.

**Canlı arayüz ayrı projeksiyondur:** `web/data/uzayx-atlas-v4.json` hızlı web erişimi için seçili kolonlardan oluşturulmuştur. Tam veri deposu değildir; arşivin tamamı bu klasördedir.

**Önemli:** 50 adayın kazanımları yıllıktır; 1–10 günlük futures getirisi değildir. 31 olay kaydı makale olay pencereleridir, mum/time-and-sales dosyası değildir. A1/A2/A3/B1/B2/T0 katkıları mevcut gözlemlerin ötesinde kanıtlanmış üstünlük göstermez. Manipülasyon varsayımları ispat olarak sunulmaz. Gerçek emir/paper fill/backtest veya kesin kâr sonucu üretilmez.
