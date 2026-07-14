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

## Gizlilik Beyanı

Uygulama hesap, reklam, analitik veya takip kullanmaz. Skor, seri, rozet ve oyun ilerleme bilgileri yalnızca cihazda yerel olarak saklanır. Bu bilgiler geliştiriciye veya üçüncü taraflara gönderilmez. Kişisel veri toplanmaz.

App Store Connect için privacy label önerisi:

- Data Collected: No
- Tracking: No
- Third-party advertising: No
- Analytics: No

Not: App Store Connect'te Privacy Policy URL zorunludur. `store-web/privacy.html` destek e-postasıyla güncellendi; dosya HTTPS üzerinden herkese açık yayınlanmalı ve URL App Store Connect'e girilmelidir.

## Gizlilik ve Destek Sayfaları

Yayın öncesinde iki statik sayfa hazırlanmalı:

- Gizlilik politikası: `store-web/privacy.html`
- Destek sayfası: `store-web/support.html`

Bu sayfalarda placeholder metin kalmamalı. En azından şu bilgiler olmalı:

- Gerçek destek e-posta adresi: islemappsupport@gmail.com
- Uygulama adı
- Son güncelleme tarihi
- Uygulamanın veri toplamadığı bilgisi
- Skor, seri, rozet ve ilerleme bilgilerinin yalnızca cihazda saklandığı bilgisi
- Reklam, takip, hesap ve analitik kullanılmadığı bilgisi
- Destek sayfasında kısa kullanım rehberi ve iletişim yöntemi

Mevcut destek e-postası: islemappsupport@gmail.com

En kolay yayınlama seçenekleri:

- Kişisel alan adı varsa bu iki HTML dosyasını orada yayınlamak
- GitHub Pages, Netlify veya Vercel gibi statik site hizmetlerinden biriyle `store-web` klasörünü yayınlamak
- Yayın sonrası iki URL'yi App Store Connect'e girmek:
  - Privacy Policy URL: `https://.../privacy.html`
  - Support URL: `https://.../support.html`

İleride hesap, reklam, analitik, çevrim içi skor tablosu veya arkadaşla yarış sistemi eklenirse gizlilik politikası ve App Store privacy label cevapları yeniden güncellenmelidir.

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
- [ ] Privacy Policy URL HTTPS üzerinden erişilebilir
- [ ] Support URL HTTPS üzerinden erişilebilir
- [ ] App Store privacy label cevapları uygulamanın mevcut veri kullanımıyla uyumlu
- [ ] iPhone ekran görüntüleri hazır
- [ ] iPad ekran görüntüleri hazır
- [ ] Yaş derecelendirmesi dolduruldu
- [ ] `npm run check` temiz
- [ ] `npm run check:ios` temiz
- [ ] TestFlight build test edildi
- [ ] App Review'e gönderildi
