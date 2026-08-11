# İşlem App Store Yayın Paketi

Bu dosya App Store Connect'e girilecek bilgileri, yayın metinlerini ve yayın öncesi kontrol listesini tek yerde toplar.

## Temel Bilgiler

- Uygulama adı: İşlem
- Bundle ID: com.aydin.islem
- SKU önerisi: islem-ios-001
- Sürüm: 1.1.0
- Build: EAS remote auto-increment
- Kategori önerisi: Games / Puzzle veya Education
- Yaş derecelendirmesi önerisi: 4+
- Desteklenen diller: Türkçe, İngilizce

## v1.1 Geliştirme Notu

App Store'daki v1.0 misafir ve cihaz içi kayıt modelini kullanır. Geliştirilmekte olan v1.1 isteğe bağlı e-posta hesabı, Supabase bulut senkronizasyonu, arkadaş özellikleri ve uygulama içinden hesap silme özelliği ekler. Oyuncuların oluşturduğu profil adları sunucuda filtrelenir; oyuncu bildirme ve engelleme akışları bulunur. Aşağıdaki v1.1 gizlilik değişiklikleri yeni sürüm gönderilmeden önce App Store Connect'te yayımlanmalıdır.

### Test Hesapları

- Geliştirme hesabı: `islemappsupport+test@gmail.com`
- App Review hesabı: `islemappsupport+appreview@gmail.com`
- Moderasyon hesabı: `islemappsupport+moderation@gmail.com` (App Review ile paylaşılmaz)
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
- Hesapsız misafir oyun ve isteğe bağlı bulut hesabı
- Reklam ve uygulamalar arası takip yok
- iPhone ve iPad desteği

## Anahtar Kelime Önerileri

App Store Connect anahtar kelime alanı 100 karakter sınırına sahiptir. Önerilen kısa liste:

matematik,işlem,sayı,bulmaca,zeka,çocuk,eğitim,dört işlem,hedef,puzzle

## Tanıtım Metni

Her gün yeni bir hedefe ulaş, serini koru ve isteğe bağlı hesabınla skorlarını buluta taşı. İşlem şimdi arkadaşlar, ligler ve bildirimlerle daha zengin.

## English (U.S.) Promotional Text

Reach a new target every day, keep your streak alive, and sync your scores with an optional account. İşlem now includes friends, leagues, and notifications.

## English (U.S.) Description

İşlem is a clean math puzzle where you use the given numbers and four arithmetic operations to reach target values.

Drag one number onto another, then choose addition, subtraction, multiplication, or division from the operation dial. If the result matches a target, that target is completed. Otherwise, the result becomes an intermediate number that can be used in later moves.

Solve a new Daily Game, practice at your preferred difficulty in Training, take on a tougher puzzle in the Weekly Challenge, or learn the rules step by step in the Tutorial.

You can play without an account and continue offline. Create an optional account to sync scores, streaks, badges, and statistics to the cloud, create a profile, add friends, join weekly leagues, and challenge friends.

Features:

- Simple drag-and-drop gameplay
- Addition, subtraction, multiplication, and division
- Easy, Medium, Hard, and Master difficulty levels
- Daily puzzles and streaks
- A weekly challenge that refreshes every week
- Hints when you get stuck
- Badges and detailed statistics
- Optional account and cloud sync
- Profiles, friends, weekly leagues, and friend challenges
- Friend and challenge notifications
- Player blocking and reporting tools
- Guest and offline play
- Turkish and English interface
- No ads or cross-app tracking
- iPhone and iPad support

Designed for children, adults, and anyone who enjoys number puzzles. Exercise your mind in short sessions, complete targets, and keep your daily streak alive.

## v1.1 Sürüm Notları

İşlem 1.1 ile:

- İsteğe bağlı hesap ve bulut senkronizasyonu eklendi.
- Skor, seri, rozet ve istatistikler hesabınla korunabilir.
- Profil, arkadaşlar, haftalık lig ve arkadaş yarışları eklendi.
- Arkadaşlık ve yarış bildirimleri eklendi.
- Oyuncu engelleme ve bildirme araçları eklendi.
- Giriş güvenliği güçlendirildi.
- Bildirim ayarları ve genel kararlılık iyileştirildi.

Hesap oluşturmak zorunlu değildir; misafir ve internetsiz oyun devam eder.

## v1.1 App Review Notu

İşlem can be played without an account. An optional account unlocks cloud progress sync, profiles, friends, weekly leagues, notifications, and friend challenges.

Please use the review account supplied in Sign-In Information to test account features. After signing in, open the profile/account control in the top-right area. Friend, league, notification, block, report, and account-deletion controls are available from the account and settings screens.

Password and magic-link sign-in are protected by Cloudflare Turnstile. The review account is already confirmed and supports password sign-in. No purchase is required. The core math game remains available offline as a guest.

The app contains no advertising, third-party analytics, or cross-app tracking.

## v1.0 Gizlilik Beyanı

Uygulama hesap, reklam, analitik veya takip kullanmaz. Skor, seri, rozet ve oyun ilerleme bilgileri yalnızca cihazda yerel olarak saklanır. Bu bilgiler geliştiriciye veya üçüncü taraflara gönderilmez. Kişisel veri toplanmaz.

App Store Connect için privacy label önerisi:

- Data Collected: No
- Tracking: No
- Third-party advertising: No
- Analytics: No

Not: App Store Connect'te Privacy Policy URL zorunludur. `store-web/privacy.html` destek e-postasıyla güncellendi ve GitHub Pages üzerinden yayına hazırlandı.

## v1.1 Gizlilik Beyanı

v1.1'de hesap isteğe bağlıdır ve misafir oyun devam eder. Hesap açan kullanıcılar için e-posta adresi, Supabase kullanıcı kimliği ve tamamlanan oyun özetleri bulutta saklanır. Oyuncu güvenliği bildirimlerinde bildiren ve bildirilen hesap kimlikleri, sabit neden ve profil adı kopyası moderasyon için tutulur. Profil adı güvenlik incelemesi sonucunda sıfırlanırsa etkilenen oyuncuya bildiren veya moderatör kimliğini içermeyen özel bir sistem bildirimi gönderilir. Kullanıcı uzaktan bildirimleri açarsa hesaba bağlı bildirim tokenı, cihaz platformu, uygulama dili ve teslim durumu işlenir. Giriş sırasında bot ve otomatik kötüye kullanım koruması için Cloudflare Turnstile ağ ve cihaz/tarayıcı sinyallerini işleyebilir. Veriler hesap girişi, güvenlik, moderasyon, skor/seri senkronizasyonu, arkadaş bildirimleri ve oyun özellikleri için kullanılır. Reklam, üçüncü taraf pazarlaması ve geliştirici tarafından uygulamalar arası kullanıcı takibi yapılmaz.

v1.1 gönderilmeden önce App Store Connect > App Privacy altında "Yes, we collect data" seçilmeli ve en az şu veri türleri beyan edilmelidir:

- Contact Info > Email Address: App Functionality; kullanıcıya bağlı; tracking yok
- Identifiers > User ID: App Functionality; kullanıcıya bağlı; tracking yok
- Identifiers > Device ID: App Functionality; kullanıcıya bağlı; tracking yok.
  Bildirim tokenının Apple'ın güncel tanımında Device ID sayılıp sayılmadığı gönderim
  sırasında App Store Connect yardım metniyle yeniden doğrulanmalı.
- User Content > Gameplay Content: App Functionality; kullanıcıya bağlı; tracking yok
- User Content > Other User Content: App Functionality; oyuncu güvenliği bildirim nedeni ve profil adı kopyası; tracking yok

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
- [x] App Store privacy label cevapları uygulamanın mevcut veri kullanımıyla uyumlu
- [x] v1.1 uygulama içinden hesap silme akışı eklendi
- [x] v1.1 geliştirme ve App Review hesapları oluşturuldu
- [x] App Review hesabı cihazdaki şifreli giriş ekranıyla test edildi
- [x] v1.1 özel SMTP ile magic link teslimatı test edildi
- [x] v1.1 magic link iOS geri dönüşü ve kalıcı oturum test edildi
- [x] v1.1 gizlilik politikası hesap ve bulut verileriyle güncellendi
- [x] v1.1 isteğe bağlı push altyapısı, APNs anahtarı ve gizlilik metni hazırlandı
- [x] v1.1 profil filtresi, oyuncu bildirme ve engelleme akışları hazırlandı
- [x] v1.1 profil yaptırımı için kimliksiz uygulama içi ve uzaktan bildirim hazırlandı
- [x] v1.1 Apple privacy manifesti toplanan veri türleriyle güncellendi
- [x] v1.1 EAS production Supabase, yönlendirme ve Turnstile sayfası değişkenleri tanımlandı
- [x] Üretim Turnstile widget anahtarı EAS ve Supabase Auth üzerinde etkinleştirildi
- [x] v1.1 gizlilik sayfası GitHub Pages'a yayımlandı
- [x] v1.1 App Store privacy label Email Address, User ID, Device ID, Gameplay Content ve Other User Content olarak güncellendi
- [ ] iPhone ekran görüntüleri hazır
- [ ] iPad ekran görüntüleri hazır
- [ ] Yaş derecelendirmesi dolduruldu
- [x] `npm run check` temiz
- [x] `npm run check:cloud` hesap izolasyonu ve anonim erişim kontrolü temiz
- [x] `npm run check:ios` temiz
- [x] v1.1 yerel Release build bağlı iPhone üzerinde açıldı
- [x] TestFlight `1.1.0 (8)` gerçek cihazda test edildi
- [x] TestFlight `1.1.0 (8)` App Store Connect'e yüklendi
- [ ] App Review'e gönderildi
