# UzayX ve TURAN — Strateji Merkezli Ar-Ge İncelemesi

25 Ekim 2026 · İncelenen veri kesiti: 13.19 Türkiye saati

## Değerlendirme

Stratejiyi merkeze alma yönü mevcut mimaride başlamış: TURAN200_ONLY politikası, sürümlü kurallar, ileriye dönük deneyler, ayrı sanal kasa ve olay-atıf zinciri var. Yeni bir strateji kataloğu ya da yeni bir arayüz katmanı öncelik değil. En yüksek getiriyi sağlaması beklenen geliştirme; aynı stratejinin her modülde aynı anlama gelmesi, iki yönün adil denenmesi, deneylerin eksiksiz sonuçlandırılması ve öğrenmenin basit bir referansı gerçekten geçip geçmediğinin ölçülmesi.

Somut yön ve kimlik tutarsızlıkları buldum. Ayrıca mevcut öğrenmenin tahmin başarısını artırdığı henüz gösterilemiyor. Bunlar projenin işe yaramayacağı anlamına gelmez; mevcut çıktılardan çıkarılabilecek sonucun sınırını gösterir. Kârlı strateji sayısı için 20–30 gibi önceden belirlenmiş bir hedefi başarı şartı yapmamak gerekir: sonuç 3, 10 veya 0 da olabilir.

## Kapsam ve dayanak

- Verilen iki 18 Ekim devir paketi; mimari, tarihçe ve kaynak belgeleri incelendi. Eski teslim paketleri güncel kod kabul edilmedi.
- Ana depo: onurqlp/coin-live-pro. Sabit inceleme commit'i: 6944f05366a7a19d9dc4fdfb1bd4aa026d95e3cd.
- Güncel strateji bankası, MTF aday seçimi, deney motoru, öğrenme motoru, araştırma modülü, atıf motoru, sanal kasa ve iş akışı okundu. JSON özetleri ve öğrenme/deney tam defterlerinden ek ölçümler hesaplandı.
- İlgili 65 mevcut Python testi yerel inceleme kopyasında geçti. Eksik test bağımlılığı ilk çalıştırmada tamamlandı; bu ilk yükleme hatası ürün hatası olarak raporlanmadı.
- T154 yön tutarsızlığı, gerçek piyasa verisi olduğu iddia edilmeyen kontrollü bir mantık örneğiyle ayrıca yeniden üretildi.
- UzayX ve TURAN üretim adresleri HTTP 200 döndü; canlı TURAN JavaScript'i ve 4.09 sürüm dosyası okundu. Tarayıcıdaki tüm etkileşimler ve APK bu çalışmada sınanmadı.
- Veri kesitindeki üretim koşusu 40184258344 başarılı. Tek başarılı koşu, kesintisiz çalışma garantisi değildir.
- Canlı sisteme, Google tarafına veya strateji kurallarına değişiklik yapılmadı. Buradaki tüm P&L değerleri simülasyon/araştırma ölçümüdür.

## Mevcut durum

| Ölçüm | Doğrulanan değer | Anlamı |
|---|---:|---|
| Ana katalog | 200 | 200 farklı, çalışır giriş stratejisi anlamına gelmiyor |
| Veriyle değerlendirilen giriş hipotezi | 53 | Güncel çevrimde kuralları değerlendirilmiş |
| Kaynak bekleyen hipotez | 114 | Eksik kaynak yerine fiyat verisi uydurulmuyor |
| Kontrol/araştırma rolü | 33 | Giriş stratejilerinden ayrı işlev |
| Ek eski araştırma kaydı | 30 | Merkezdeki toplam 230 kaydın parçası |
| Güncel piyasa evreni / derin tarama | 82 / 23 coin | Tüm Binance Futures evreni değil |
| Kaydedilen ileri tahmin / sonuçlanan | 1.440 / 227 | Kayıt sayısı başarı oranı değildir |
| Öğrenme örnekleri | 453 coin epizodu, 121 piyasa saati | Birbirinden tam bağımsız 453 deney olarak yorumlanmamalı |
| Deney sayısı | 2.951 | Strateji ve saat bazında; tekrarlar ve ortak piyasa etkisi var |
| Deneylerde farklı coin–yön–gün kümesi | 165 | Küme sayısı da istatistiksel bağımsızlık kanıtı değil |
| Bağımsız kârlılığı doğrulanmış strateji | 0 | Sistem de bu konuda doğru biçimde iddia üretmiyor |
| Ortak sanal kasa özsermayesi | 9.956,02 USDT | 10.000 USDT başlangıca göre toplam −43,98 USDT |
| Atfedilebilir / atfedilemeyen modelli P&L | +223,34 / −267,31 USDT | Ortak kasa toplamı yalnız yeni TURAN performansı değildir |
| Dolmuş işlemlerde atıf kapsamı | %62,03 | 403 dolmuş kaydın 250'si atıf şartlarını karşılıyor |
| Binance arşivi | 298 sembol, 312 aylık dosya, 73.125 saatlik mum | Kısmi arşiv; tüm geçmişi kapsadığı anlamına gelmiyor |

Sanal kasa için gerçekleşmiş modelli sonuç −68,23 USDT, açık işlemlerin modelli sonucu +24,25 USDT; tahmini işlem ücretleri 145,68 USDT. Funding modellenmemiş, tasfiye doğrulanmamış. Bu yüzden eksiksiz net borsa kârı çıkarılamaz. Atıf toplamında EXACT ve contemporaneous doğum kaydından RECONSTRUCTED seviyeleri birlikte kullanılmaktadır.

## Korunması gereken güçlü taraflar

Sinyal doğumunda kural sürümü, kaynak zamanı ve kimliklerin dondurulması doğru bir temel. Aynı taramayı tekrar çalıştırarak deney sayısının şişirilmemesi, eksik kaynağın açıkça engellenmesi ve değişmez çevrim kayıtları değerli.

Asıl, ters, teyit bekle ve işlem yapma kolları zaten var. Ters yönün sonucu asıl kârın işaretini değiştirmekle oluşturulmuyor; ayrı giriş, stop, hedef ve maliyet hesabı var. Bu sistemi yeniden yazmak yerine ölçümünü tamamlamak daha uygun.

Öğrenme katmanı geçmiş sonucu sonradan tahminmiş gibi göstermiyor. Zamansal ayırma, sonuç etiketi için bekleme ve hedef coini komşu havuzundan çıkarma kontrolleri bulunuyor. Model yeterli kanıt bulamadığında kasa politikasını otomatik değiştirmiyor. Haber/ATLAS ve yardımcı MAKİNE/ALTI bağlamının doğrudan emir olarak kullanılmaması da korunmalı.

## Öncelikli bulgular

### 1. T154 aynı olayda iki modülde zıt yön üretebiliyor — yüksek öncelik

Strateji bankasında T060 ve T154 aynı `failed_breakout` koşulunu kullanıyor. Bu koşul, seçilmiş LONG yönü için önce yukarı kırılım sonra banda dönüşte doğru oluyor; çıktı yönü LONG kalıyor. Ayrı araştırma modülündeki T154 aynı yukarı kırılımın başarısızlığını SHORT olarak kaydediyor.

Kontrollü örnek: önceki üst bant 101; önceki mum kapanışı 104; yeni mum kapanışı 100. Banka T154/LONG koşulunu sağladı, araştırma modülü T154/SHORT üretti. Bu örnek piyasa performansı değil, kod davranışının yeniden üretimidir.

Sonuç: Aynı isim altında farklı tezler ölçülüyor. T154 bankasıyla T154 araştırma istatistiğini aynı stratejinin kanıtı gibi toplamak uygun değil. T060 da aynı koşulu paylaştığı için ayrı incelenmeli. Buradan kaç geçmiş işlemin etkilendiği veya toplam parasal etki hesaplanmadı.

Öneri: Stratejinin yön anlamı tek yerde tanımlansın; aynı olay ve sürüm her tüketicide aynı yönü versin. Düzeltme yeni kural sürümü olarak doğsun; eski kayıtlar geriye dönük yeniden etiketlenmesin.

### 2. Araştırma ve işlem bankası aynı T kimliklerinde farklı kurallar kullanıyor — yüksek öncelik

`uzayx_research.py` yedi pilot aileyi ayrı kurallarla değerlendiriyor. Örneğin T032 araştırmada 16 saatlik referans ve belirli retest dizisi kullanırken bankada farklı pencere/dizi hesabı var. Bu farklı deneyler olabilir; sorun farklı sürümlerin merkezde yalnız `strategy_id` üzerinden birleştirilmesi.

`turan_core.py`, araştırma olaylarını kimliğe göre özetleyip banka ve kasa satırıyla yan yana koyuyor. Ayrıca araştırmanın eski `account()` gruplaması yalnız SPARK kimliklerini tanıdığı için mevcut raporda 1.612 kaydı LEGACY_UNASSIGNED sayarken yeni atıf raporu 250 dolmuş kaydı stratejiye bağlayabiliyor. Bunlar iki farklı atıf sözleşmesi; kullanıcıya aynı kavrammış gibi sunulmamalı.

Öneri: Ölçüm anahtarı strateji kimliği + kural sürümü + kural özeti + borsa + deney politikası olsun. Tek bir tanımlı atıf sözleşmesi yayımlansın. Geçmiş pilot sonuçları korunarak kendi sürümünde gösterilsin.

### 3. Her coin için önce tek yön seçiliyor — yüksek öncelik

MTF katmanı günlük/4 saatlik trende bakarak her coin için tek LONG veya SHORT yönü seçiyor. Banka kuralları yalnız o yönde değerlendiriliyor. İki ana trend de yataysa varsayılan yön LONG olabiliyor.

Bu düzen trend devamı stratejileri için bilinçli bir filtre olabilir. Ancak dipten dönüş, tepeden dönüş, başarısız kırılım ve karşı eğilim stratejilerini de aynı ön filtreden geçirmek araştırmayı eksik bırakır. Sonradan açılan ters deney kolu, karşı yönde hiç değerlendirilmemiş bütün kuralların yerini tutmaz.

Öneri: Araştırmada LONG ve SHORT tezleri ayrı değerlendirilsin. Ortak kasaya kabul sırasında stratejinin gerektirdiği rejim filtresi uygulansın. Etkisi, kaç ek geçerli aday ve hangi modelli sonuçlar oluştuğuyla ölçülsün; daha fazla sinyal başlı başına başarı sayılmasın.

### 4. Öğrenmenin mevcut tahmin üstünlüğü gösterilemiyor — yüksek öncelik

Tam öğrenme defterinde aynı 227 sonuçlanmış tahmini eşleştirerek tekrar hesapladım:

| Aynı sonuçlar üzerindeki ölçüm | Değer |
|---|---:|
| Modelin ortalama mutlak hatası | %1,74773 |
| Her örnekte getiriyi sıfır tahmin eden referansın hatası | %1,69149 |
| Modelin ek mutlak hatası | 0,05624 yüzde puan |

Model bu veri kesitinde basit sıfır tahminini geçemiyor. Bu karşılaştırma “işlem yapmamak sıfır kâr getirir” karşılaştırmasından farklıdır: burada ikisi de aynı gerçekleşmiş getiri değerini tahmin ediyor. Örneklem bağımlılığı nedeniyle bu hesap kalıcı başarısızlık veya istatistiksel anlamlılık iddiası değildir.

Üç kronolojik doğrulama bloğu var, ancak seçilmiş gölge şampiyon yok. TREND_VOLUME politikasının stresli saatlik alt ölçüsü de negatif. 7,875 günlük toplam veri açıklığı, her stratejinin yedi gün doğrulandığı anlamına gelmiyor.

Öneri: İlerleme panelinde toplam tahmin sayısının yanında aynı örneklerde sıfır/rejim referansına göre hata farkı, seçilmiş politika, bağımsız gün/epizot kapsamı ve maliyet sonrası gölge sonuç gösterilsin. Model sürümleri aynı değerlendirme kümesinde karşılaştırılsın.

### 5. Deney sonuçları eksik veri ve farklı kapanış kümelerinden etkileniyor — yüksek öncelik

Asıl kolda 537/2.951, yani yaklaşık %18,2 deney SOURCE_GAP durumunda. Ters kolda 435, bekle kolunda 334 kaynak boşluğu var. Deney motoru yalnız o anki chart-pack'i kullanıyor. Bu paket seçilmiş coinlerde son 60 adet 5 dakikalık mumu, yaklaşık beş saati taşıyor; uzun süre geri dönmeyen coinlerde eksik başlangıç/aralık sonradan bu pencereden kurtarılamayabilir.

Motorun eksik aralığı atlamaması doğru. Eksik olan, deney açılan coinlerin sonuçlandırılana kadar kalıcı ve düzenli veriyle izlenmesi. Kaynak boşluğunun hangi piyasa olaylarında yoğunlaştığı da ölçülmeli; rastgele eksik olduğu varsayılmamalı.

Öneri: Açık deney coinleri için kalıcı izleme kuyruğu ve son işlenen mumdan itibaren aralık tamamlama eklenmesi değerlendirilsin. Eksik kalmış sonuçlar raporun paydasında kalsın. Asıl/ters/bekle kıyasları aynı deney kimliklerinde, ortak sonuçlanan kümede ve dışarıda kalan örnek sayısıyla verilsin.

### 6. Binance geçmişi toplanıyor; 200 stratejiyi eğiten ortak replay hattı henüz değil — orta/yüksek öncelik

Arşiv toplayıcısı kısmi Binance 1H dosyaları indiriyor; güncel banka ve öğrenme ise OKX gözlemleri/sanal işlem defterleri üzerinden çalışıyor. Arşiv dosyalarının sayısının artması kendiliğinden daha iyi strateji veya eğitim sonucu üretmiyor. Arşivde güncel işlem durumu doğrulanmış sembol sayısı da sıfır; mevcut kaynak erişim problemi raporlanmış.

Öneri: Önce mevcut 53 fiyat tabanlı hipotez için sürümlü kuralları kullanan tek bir geçmiş oynatma hattı kurulsun. Borsa, sözleşme, mevcut olma tarihi ve maliyetler ayrı tutulsun. OHLCV, veri isteyen 114 hipotezin hepsini açamaz. Teyit edilmiş işlem akışı, emir defteri, OI/funding veya olay takvimi gereksinimleri ayrı ele alınmalı.

Binance'in resmi arşivi farklı mum aralıkları, işlem/aggTrade verisi ve mark/index fiyat serileri için yollar sunuyor. Veri bütünlüğü için CHECKSUM kullanımı mevcut toplayıcıda yerinde; arşiv sağlayıcısı geçmiş dosyaları düzeltebildiği için kaynak sürümü de saklanmalı.

### 7. Öncelik sırası, ortak kasa ve deney başarısı ayrılmalı — orta öncelik

Bağımsız ileri doğrulamadan geçmiş öncelik mevcut kesitte boş. Bu durumda banka çoğunlukla kimlik sırasını kullanıyor; birlikte tetiklenen kurallarda düşük numara birincil atfı daha sık alabilir. Bağımsız deney motoru bu yanlılığın bir kısmını zaten azaltıyor. Ortak kasadaki birincil işlem sayısı tek başına stratejiler arası adil yarış değildir.

Merkezin ilk 30 sırası da esasen kapalı işlem varlığı ve gözlem sayısından üretiliyor; beklenen kâr sıralaması sayılmamalı. Şimdilik “inceleme önceliği” olarak kullanılabilir.

Öneri: Deney kalitesi, ortak kasaya marjinal katkı ve kural benzerliği ayrı ölçülsün. T060/T154 gibi aynı koşullar iki bağımsız oy sayılmasın. Birçok stratejinin aynı piyasa hareketinde birlikte kazanması, çeşitlendirme kanıtı değildir.

## Ters yönde araştırılmaya değer bir gözlem

Tam deney defterinde hem asıl hem ters kolu kapanmış aynı 1.979 deney karşılaştırıldığında asıl modelli toplam −619,70 USDT, ters modelli toplam +1.846,96 USDT. Eşleştirilmemiş rapor toplamları ise farklıdır: asıl −2.872,90; ters +269,18 USDT. Bu büyük fark, kapanan örnek seçiminin sonucu ne kadar değiştirdiğini gösteriyor.

Bu toplamlar bağımsız sermaye sınırlı portföy getirisi değildir. Aynı coin ve saat birden fazla stratejide sayılıyor; deneyler yaklaşık bir günlük yeni sistemden geliyor, maliyetlerin tamamı bilinmiyor ve yön tutarsızlığı da var. “Tersi kazandırıyor” kararı çıkarılamaz.

Eşleştirilmiş kesitte T011, T042 ve T043'ün ters kolları takip edilecek araştırma adayları arasında. Önce kural/yön tutarlılığı düzeltilmeli; sonra yeni ve ayrılmış veri üzerinde, eşleştirilmiş sonuç ve sermaye sınırıyla tekrar sınanmalı. Bu gözlem işlem önerisi veya strateji yükseltmesi değildir.

## Geliştirme sırası ve tamamlanma ölçüsü

| Sıra | Çalışma | Tamamlandığını ne gösterecek? |
|---|---|---|
| 1 | T154/T060 yönü ve tek sürümlü kural/atıf sözleşmesi | Aynı kaynak ve sürüm tüm tüketicilerde aynı kararı üretir; eski veri değişmez |
| 2 | İki yönlü araştırma ve açık deney veri takibi | LONG/SHORT kapsamı ölçülür; SOURCE_GAP yeni deneylerde düşer; eksikler saklanır |
| 3 | Öğrenmenin referanslarla ve eşleştirilmiş kollarla ölçümü | Hata/sonuç farkı aynı örneklerde, belirsizlik ve dışlananlarla yayımlanır |
| 4 | 53 uygulanabilir hipotez için ortak replay | Tarihsel sonuçlar ileri gözlemden ayrılır; aynı kural sürümü yeniden üretilebilir |
| 5 | Kaynak açma önceliği | Eklenen kaynağın açtığı hipotez ve yeni veri dışındaki katkısı ölçülür |
| 6 | Ortak kasaya katkı ve rejim bazlı seçim | Komisyon/funding, sermaye kısıtı, düşüş ve korelasyon sonrası katkı gösterilir |

İlk aşamada yeni strateji sayısı veya kaldıraç artırımı önermiyorum. Mevcut 53 uygulanabilir hipotezin tanımını ve sonuçlarını sağlamlaştırmak daha doğrudan bir araştırma kazancı sağlar. Sonraki yeni kaynak seçimi de “kaç strateji açtı?” ile birlikte “hangi bağımsız bilgi ve maliyet sonrası katkıyı ekledi?” sorusuyla yapılmalı.

200 hipotez ve varyantları arasından en iyi görüneni seçmek tesadüfi kazanan riskini artırır. Mevcut zamansal ayırma kontrolleri korunmalı; denenen bütün sürümler kaydedilmeli, dokunulmamış son dönem ayrılmalı ve çoklu deneme/bağımlılık etkisi ayrıca değerlendirilmelidir. Tek bir 7 gün veya 60 işlem eşiği başarı garantisi değildir.

## Kaynaklar ve yeniden inceleme noktaları

Kod bağlantıları sabit inceleme commit'ine gider:

- [Strateji bankası: kurallar, yön metriği ve birincil seçim](https://github.com/onurqlp/coin-live-pro/blob/6944f05366a7a19d9dc4fdfb1bd4aa026d95e3cd/engine/uzayx_strategy_bank.py#L179)
- [Ayrı araştırma kuralları ve eski hesap gruplaması](https://github.com/onurqlp/coin-live-pro/blob/6944f05366a7a19d9dc4fdfb1bd4aa026d95e3cd/engine/uzayx_research.py#L49)
- [MTF tek yön seçimi](https://github.com/onurqlp/coin-live-pro/blob/6944f05366a7a19d9dc4fdfb1bd4aa026d95e3cd/engine/mtf.py#L244)
- [TURAN kimlik bazlı gözlem birleştirmesi](https://github.com/onurqlp/coin-live-pro/blob/6944f05366a7a19d9dc4fdfb1bd4aa026d95e3cd/engine/turan_core.py#L216)
- [Deney motoru ve kaynak sürekliliği](https://github.com/onurqlp/coin-live-pro/blob/6944f05366a7a19d9dc4fdfb1bd4aa026d95e3cd/engine/turan_experiments.py)
- [Öğrenme motoru](https://github.com/onurqlp/coin-live-pro/blob/6944f05366a7a19d9dc4fdfb1bd4aa026d95e3cd/engine/uzayx_adaptive.py)
- [Öğrenme tam defteri; 227 eşleştirilmiş hata hesabının kaynağı](https://github.com/onurqlp/coin-live-pro/blob/6944f05366a7a19d9dc4fdfb1bd4aa026d95e3cd/archive/uzayx-adaptive-ledger.json)
- [Deney tam defteri; eşleştirilmiş kol hesabının kaynağı](https://github.com/onurqlp/coin-live-pro/blob/6944f05366a7a19d9dc4fdfb1bd4aa026d95e3cd/archive/turan-experiments-ledger.json)
- [Kesit TURAN raporu](https://github.com/onurqlp/coin-live-pro/blob/6944f05366a7a19d9dc4fdfb1bd4aa026d95e3cd/web/data/turan-core.json)
- [Kesit kasa raporu](https://github.com/onurqlp/coin-live-pro/blob/6944f05366a7a19d9dc4fdfb1bd4aa026d95e3cd/web/data/uzayx-pnl-report.json)
- [Doğrulanan başarılı üretim koşusu](https://github.com/onurqlp/coin-live-pro/actions/runs/40184258344)
- [Binance resmi halka açık veri deposu](https://github.com/binance/binance-public-data)
- [Binance resmi vadeli piyasa veri belgeleri](https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/market-data)
- [Bailey ve diğerleri: The Probability of Backtest Overfitting](https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf)
- [Bailey ve López de Prado: The Deflated Sharpe Ratio](https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf)

Sayısal değerler belirtilen commit ve tarama kesitine aittir; sistemin sonraki otomatik çalışmaları bunları değiştirebilir. Kaynak okumasından türetilen öneriler uygulanmış değişiklik değildir.
