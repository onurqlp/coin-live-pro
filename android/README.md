# UzayX Android — site tabanlı APK

Bu uygulama **onurqlp/coin-live-pro** reposunda üretilir ve mevcut **UzayX** sitesini tam ekran Android WebView içinde gösterir.

- Canlı ekran: https://onurqlp.github.io/coin-live-pro/uzayx/
- Her Android APK dağıtımında sabit indir bağlantısı: https://github.com/onurqlp/coin-live-pro/releases/download/uzayx-android/UzayX.apk
- İş akışı: [UzayX Android APK](https://github.com/onurqlp/coin-live-pro/actions/workflows/uzayx-android.yml)
- Android 7.0+ (API 24). Telefon internet bağlantısı ve güncel Android System WebView / Chrome gerekir.
- HTML, CSS, JS, radar ve JSON verileri APK içinde **dondurulmaz**. Kullanımda güncel site yüklenir. GitHub Pages ve HTTP önbelleklerinin yayılma süresi olabilir; her değişiklik anında görünme garantisi yoktur.
- Site güncellemeleri (web/**) Android iş akışını **tetiklemez**. Yeni APK yalnız Android kaynakları veya Android iş akışı değişirse oluşturulur.
- 1.1.0 sürümü aynı doğrulanmış web adresini açar; tarihsel Binance araştırması uygulamada gerçek işlem etkinleştirmez.
- Uygulama tek başına piyasa emirleri vermez, canlı işlemleri etkinleştirmez ve hesap giriş bilgilerini saklamaya çalışmaz.
- Haricî siteler (örn. Binance Futures) tarayıcıda açılır. Bağlantı yoksa yeniden dene ekranı çıkar.
- İlk sürüm geliştirme amaçlı **debug-signed APK**'dır; Play Store yayını değildir. Tekrar oluşturulan debug APK'nın imzası farklı olabileceği için kurulu bir sürümün üzerine güncelleme yükleme desteklenmeyebilir. İnternet sitesi güncellemelerinde zaten yeni APK yüklemek gerekmez. Gerçek dağıtım için kalıcı imza anahtarı güvenli GitHub Actions Secrets içinde kurulmalıdır.

Yapı: android/app/src/main/java/com/uzayx/terminal/MainActivity.java

Yerel derleme (Android SDK + Gradle 8.10.2 + JDK 17): `gradle -p android :app:assembleDebug`.

Yeni tasarım / veriler için **web/uzayx/** ve **web/data/** güncellenir; Android koduna dokunulmaz.
