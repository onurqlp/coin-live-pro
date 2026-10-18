# UzayX — Google Sheets son kurulum
**Asıl dosya:** https://docs.google.com/spreadsheets/d/17xCk7i_F3XRGzyts1EF89vfrPiAUPbnEqATAM4fj9nA/edit

2026-10-18 bağlantılı Google Drive okumasında 15 sekme vardı. `V4_SISTEM!A2:B2` güncellenme saati **2026-10-17T16:42:22+00:00** idi. GitHub kaynak taramaları daha yeni olduğundan Google canlı senkronun çalıştığı gösterilemedi.

## Kullanıcının yapacağı tek seferlik adımlar
1. Yukarıdaki mevcut Google Sheet'i aç. **Uzantılar → Apps Script**.
2. GitHub'daki [entegrasyon kaynak dosyasını](https://github.com/onurqlp/coin-live-pro/blob/main/integrations/google-v4-sync.gs) aç; kodu mevcut Apps Script projesinde aynı adla bir dosyaya yerleştir veya ilgili eski V4 kodunu bununla güncelle. Mevcut V3 kodlarını/diğer tetikleyicileri silme.
3. Fonksiyon listesinden **`installCoinLiveV4Sync`** seç ve bir kez çalıştır; Google hesap yetkilerini hesabından onayla. Fonksiyon mevcut `syncCoinLiveV4` tetikleyicisini yeniden kurar ve hemen bir eşitleme başlatır.
4. `V4_SISTEM` sekmesindeki son UTC zamanı ve `SCAN ID` hücresini kontrol et; sonra 10-20 dakika içinde ilerleyip ilerlemediğini doğrula. Eski satırlar korunmalı.

İşlem biterse UzayX sohbetine sadece **“Google tamam”** de; tekrar bütün kodu açıklamaya gerek yok.

## Kaynak koruma
- V4 orijinal 4 sekme şeması: `V4_GUNLUK`, `V4_STRATEJILER`, `V4_TICKETLER`, `V4_SISTEM`.
- Google tarafı eski V3 verilerini ve farklı sekmeleri korumalı.
- Bu Google kurulumunun UzayX terminalini engellemesi gerekmez: terminal veriyi GitHub'dan doğrudan doğrulayarak okur.
- UzayX öğrenme arşivi `web/data/uzayx-lessons-history.json` içindedir; Google'a geçici sahte PnL aktarılmaz.
