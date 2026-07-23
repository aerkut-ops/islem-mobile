# İşlem App Store Yayın Paketi

Bu dosya App Store Connect'e girilecek bilgileri, yayın metinlerini ve yayın öncesi kontrol listesini tek yerde toplar.

## Temel Bilgiler

- Uygulama adı: İşlem
- Bundle ID: com.aydin.islem
- SKU önerisi: islem-ios-001
- Sürüm: 1.0.0
- Build: 1
- Kategori önerisi: Games / Puzzle veya Education
- Yaş derecelendirmesi önerisi: 4+
- Desteklenen diller: Türkçe, İngilizce

## v1.1 Geliştirme Notu

App Store'daki v1.0 misafir ve cihaz içi kayıt modelini kullanır. Geliştirilmekte olan v1.1 isteğe bağlı e-posta hesabı, Supabase bulut senkronizasyonu ve uygulama içinden hesap silme özelliği ekler. Aşağıdaki v1.1 gizlilik değişiklikleri yeni sürüm gönderilmeden önce App Store Connect'te yayımlanmalıdır.

### Test Hesapları

- Geliştirme hesabı: `islemappsupport+test@gmail.com`
- App Review hesabı: `islemappsupport+appreview@gmail.com`
- Şifreler kaynak kodda veya repoda tutulmaz; macOS Anahtar Zinciri servisleri sırasıyla `islem-supabase-test-account` ve `islem-app-review-account` adlarıyla saklanır.
- App Review hesabı silinmemeli ve inceleme süresince Supabase backend'i erişilebilir kalmalıdır.
- App Store Connect > App Review Information alanına App Review hesabının e-posta ve şifresi girilmelidir.

## Kısa Açıklama

Verilen sayıları sürükleyip işlemleri seçerek hedef sayılara ulaşmaya çalıştığın sade bir matematik oyunu.

## Alt Başlık Önerileri

- Sayılarla hedefe ulaş
- Sürükle, işlem seç, çöz
- Her yaş için sayı oyunu

## Açıklama

İşlem, verilen sayılar ve dört işlemle hedef sayılara ulaşmaya çalıştığın sade bir matematik oyunudur.

Sayıyı parmağınla tut, başka bir sayının üzerine bırak ve açılan işlem kadranından toplama, çıkarma, çarpma veya bölme seç. Sonuç hedeflerden biriyse hedef tamamlanır; değilse ara sonuç olarak oyuna eklenir ve yeni işlemlerde kullanılabilir.

Ana ekranda Günlük Oyun, Antrenman, Haftalık Meydan Okuma, Öğretici, İstatistikler ve Ayarlar bölümleri bulunur. Günlük Oyun bugünün bulmacasını açar; Antrenman seviye seçerek pratik yapmanı sağlar; Haftalık Meydan Okuma her hafta yenilenen daha zor bir bulmaca sunar; Öğretici ise oyunu örnek bölümde adım adım anlatır.

Kolay, Orta, Zor ve Usta seviyeler farklı hedefler ve sayı kombinasyonlarıyla tekrar oynanabilir bulmacalar üretir. Takıldığında ipucu ampulünü kullanarak bir hedefe giden ilk iki sayıyı görebilirsin.

Öne çıkanlar:

- Basit sürükle-bırak oynanış
- Toplama, çıkarma, çarpma ve bölme işlemleri
- Öğreticili örnek bölüm
- Kolay, Orta, Zor ve Usta seviyeler
- Günlük bulmaca, ilk tamamlama bonusu ve seri sistemi
- Haftalık yenilenen meydan okuma bulmacası
- İpucu sistemi
- Başarı rozetleri ve istatistikler
- İnternetsiz oynanış
- Cihaz diline göre Türkçe/İngilizce arayüz
- Reklam, hesap ve takip yok
- iPhone ve iPad desteği

## Anahtar Kelime Önerileri

App Store Connect anahtar kelime alanı 100 karakter sınırına sahiptir. Önerilen kısa liste:

matematik,işlem,sayı,bulmaca,zeka,çocuk,eğitim,dört işlem,hedef,puzzle

## Tanıtım Metni

Sayıları sürükle, işlemi seç ve hedeflere ulaş. İşlem, her yaş için sade ve hızlı bir matematik bulmacasıdır.

## v1.0 Gizlilik Beyanı

Uygulama hesap, reklam, analitik veya takip kullanmaz. Skor, seri, rozet ve oyun ilerleme bilgileri yalnızca cihazda yerel olarak saklanır. Bu bilgiler geliştiriciye veya üçüncü taraflara gönderilmez. Kişisel veri toplanmaz.

App Store Connect için privacy label önerisi:

- Data Collected: No
- Tracking: No
- Third-party advertising: No
- Analytics: No

Not: App Store Connect'te Privacy Policy URL zorunludur. `store-web/privacy.html` destek e-postasıyla güncellendi ve GitHub Pages üzerinden yayına hazırlandı.

## v1.1 Gizlilik Beyanı

v1.1'de hesap isteğe bağlıdır ve misafir oyun devam eder. Hesap açan kullanıcılar için e-posta adresi, Supabase kullanıcı kimliği ve tamamlanan oyun özetleri bulutta saklanır. Giriş sırasında bot ve otomatik kötüye kullanım koruması için Cloudflare Turnstile ağ ve cihaz/tarayıcı sinyallerini işleyebilir. Veriler hesap girişi, güvenlik, skor/seri senkronizasyonu ve oyun özellikleri için kullanılır. Reklam, üçüncü taraf pazarlaması ve geliştirici tarafından uygulamalar arası kullanıcı takibi yapılmaz.

v1.1 gönderilmeden önce App Store Connect > App Privacy altında "Yes, we collect data" seçilmeli ve en az şu veri türleri beyan edilmelidir:

- Contact Info > Email Address: App Functionality; kullanıcıya bağlı; tracking yok
- Identifiers > User ID: App Functionality; kullanıcıya bağlı; tracking yok
- User Content > Gameplay Content: App Functionality; kullanıcıya bağlı; tracking yok

Uygulama davranışı değişirse Product Interaction, Device ID, Diagnostics veya başka veri türlerinin gerekip gerekmediği yeniden kontrol edilmelidir. Cloudflare Turnstile üretimde etkinleştirilmeden önce Apple'ın App Privacy tanımlarıyla güvenlik amaçlı teknik veri işleme yeniden değerlendirilmelidir. Apple, kaydedilmiş oyun ve oyun mantığı için Gameplay Content beyan edilmesini ister.

## Gizlilik ve Destek Sayfaları

Yayın öncesinde iki statik sayfa hazırlanmalı:

- Gizlilik politikası: `store-web/privacy.html`
- Destek sayfası: `store-web/support.html`

Bu sayfalarda placeholder metin kalmamalı. En azından şu bilgiler olmalı:

- Gerçek destek e-posta adresi: islemappsupport@gmail.com
- Uygulama adı
- Son güncelleme tarihi
- v1.0 ve v1.1 arasındaki veri kullanımı farkı
- İsteğe bağlı hesapta e-posta, kullanıcı kimliği ve oyun sonuçlarının bulutta saklandığı bilgisi
- Misafir oyunun cihazda saklandığı bilgisi
- Reklam ve takip kullanılmadığı bilgisi
- Uygulama içinden hesap silme yöntemi
- Destek sayfasında kısa kullanım rehberi ve iletişim yöntemi

Mevcut destek e-postası: islemappsupport@gmail.com

Yayınlanan sayfalar:

- Privacy Policy URL: `https://aerkut-ops.github.io/islem-mobile/privacy.html`
- Support URL: `https://aerkut-ops.github.io/islem-mobile/support.html`

Alternatif olarak ileride kişisel alan adı kullanılırsa bu iki HTML dosyası orada da yayınlanabilir.

Reklam, analitik, abonelik, çevrim içi skor tablosu veya arkadaşla yarış sistemi eklendiğinde gizlilik politikası ve App Store privacy label cevapları yeniden güncellenmelidir.

## Ekran Görüntüleri

Apple en az 1, en fazla 10 ekran görüntüsü kabul eder. Önerilen set:

1. Ana ekran
2. Günlük oyun ekranı
3. Antrenman seviye seçimi
4. Sürükle-bırak oynanış
5. İşlem kadranı
6. İpucu kullanımı
7. Hedef tamamlanmış ekran
8. Haftalık meydan okuma ekranı
9. Seri ekranı
10. İstatistikler ekranı

Gerekli cihaz setleri için en az iPhone büyük ekran ve iPad ekran görüntüleri hazırlanmalı.

## Yayın Komutları

Ön kontrol:

```bash
npm run check
npm run check:ios
```

EAS hesabına giriş:

```bash
npm run eas:login
```

Production iOS build:

```bash
npm run build:ios
```

App Store Connect gönderimi:

```bash
npm run submit:ios
```

## Yayın Öncesi Kontrol Listesi

- [ ] Apple Developer hesabı aktif
- [ ] Expo/EAS hesabına giriş yapıldı
- [ ] `com.aydin.islem` bundle ID Apple Developer hesabında uygun
- [ ] App Store Connect'te uygulama kaydı açıldı
- [ ] App Store açıklaması mevcut uygulamayla uyumlu
- [ ] Görünmeyen veya geliştirme aşamasındaki özellikler App Store metninde vaat edilmedi
- [x] Privacy policy sayfasındaki placeholder iletişim metni kaldırıldı
- [x] Support sayfasındaki placeholder iletişim metni kaldırıldı
- [x] Privacy Policy URL HTTPS üzerinden erişilebilir
- [x] Support URL HTTPS üzerinden erişilebilir
- [ ] App Store privacy label cevapları uygulamanın mevcut veri kullanımıyla uyumlu
- [x] v1.1 uygulama içinden hesap silme akışı eklendi
- [x] v1.1 geliştirme ve App Review hesapları oluşturuldu
- [x] App Review hesabı cihazdaki şifreli giriş ekranıyla test edildi
- [x] v1.1 özel SMTP ile magic link teslimatı test edildi
- [x] v1.1 magic link iOS geri dönüşü ve kalıcı oturum test edildi
- [x] v1.1 gizlilik politikası hesap ve bulut verileriyle güncellendi
- [ ] v1.1 gizlilik sayfası GitHub Pages'a yayımlandı
- [ ] v1.1 App Store privacy label e-posta, kullanıcı kimliği ve Gameplay Content olarak güncellendi
- [ ] iPhone ekran görüntüleri hazır
- [ ] iPad ekran görüntüleri hazır
- [ ] Yaş derecelendirmesi dolduruldu
- [x] `npm run check` temiz
- [x] `npm run check:cloud` hesap izolasyonu ve anonim erişim kontrolü temiz
- [x] `npm run check:ios` temiz
- [ ] TestFlight build test edildi
- [ ] App Review'e gönderildi
