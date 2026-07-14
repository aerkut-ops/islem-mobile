# İşlem

Expo / React Native ile hazırlanan mobil uygulama sürümü.

## Çalıştırma

```bash
npm start
```

Expo açıldıktan sonra iPhone'da Expo Go ile QR kod okutulabilir. Windows'ta yerel iOS build alınamaz; App Store build aşaması için macOS/Xcode veya EAS Build gerekir.

## Oynanış

Uygulama giriş ekranında dört bölümle açılır: Günlük Oyun, Antrenman, Meydan Okuma ve Öğretici. Günlük Oyun bugünün özel bulmacasını, Antrenman seviye seçerek pratik yapmayı, Meydan Okuma haftalık Usta bulmacasını, Öğretici ise örnek bölümde adım adım öğrenmeyi başlatır.

Sayıyı parmağınla tutup başka bir sayının üzerine bırak. Açılan işlem kadranından `+`, `-`, `×` veya `÷` seçildiğinde sonuç ara sonuçlara eklenir. Üst sağdaki `+` yeni oyun başlatır, `↺` aynı oyunu sıfırlar.

Üst sağdaki `Ayarlar` düğmesinden ses, zorluk, günlük bulmaca, haftalık meydan okuma, rozetler ve lig listesi yönetilir.

`Örnek` bölümünde oyunun nasıl oynandığını anlatan dokunarak ilerleyen kısa bir öğretici bulunur. Diğer seviyelerde öğretici gösterilmez.

Yeni oyun döngüsünde günlük bulmaca, haftalık meydan okuma, günlük seri, rozetler, haftalık yerel lig listesi ve bölüm bitince görünen istatistik özeti bulunur. Günlük ve haftalık challenge tekrarları yalnızca ilk tamamlamada puan verir; günlük ilk tamamlama %50 bonusla işlenir.

## Dil Desteği

Uygulama cihaz dilini otomatik algılar. Telefon dili Türkçeyse Türkçe, diğer dillerde İngilizce arayüz kullanılır.

## Mac'te En Kolay Yol

Geliştirme ve test için:

```bash
npm run ios
```

Bu komut Xcode Simulator açıksa uygulamayı iPhone simülatöründe başlatır. Gerçek iPhone'da denemek için `npm start` çalıştırıp Expo Go ile QR kodu okutmak genelde daha hızlıdır.

Yayın öncesi hızlı kontrol:

```bash
npm run check
npm run check:ios
```

App Store build için:

```bash
npm run eas:login
npm run build:ios
```

Build bitince App Store Connect'e göndermek için:

```bash
npm run submit:ios
```

Yani Mac'te pratik sıra şu: `npm run ios`, sonra `npm run check`, sonra `npm run build:ios`.

## Xcode ile Çalıştırma

Xcode'da çalıştırırken Metro packager açık olmalı. Aksi halde uygulama şu hatayı verir:

```text
No script URL provided. Make sure the packager is running or you have embedded a JS bundle in your application bundle.
```

Doğru sıra:

```bash
cd /Users/aydinerkut/Desktop/islem/islem-mobile
npm run xcode:metro
```

Bu terminal penceresini açık bırak. Sonra ikinci bir terminal penceresinde:

```bash
cd /Users/aydinerkut/Desktop/islem/islem-mobile
npm run xcode
```

Xcode açılınca:

- `ios/lem.xcworkspace` açık olmalı; `.xcodeproj` değil.
- Üstten iPhone Simulator veya bağlı iPad'i seç.
- `Product > Scheme > Edit Scheme > Run > Build Configuration` değeri `Debug` olsun.
- Run düğmesine bas.

Fiziksel iPad/iPhone için Mac ve cihaz aynı Wi-Fi ağında olmalı. Mac güvenlik duvarı sorarsa Node veya Terminal için yerel ağ izni ver.

Terminal/Xcode hâlâ aynı hatayı verirse:

- Xcode'da Stop yap.
- Cihazdan uygulamayı sil.
- Xcode'da `Product > Clean Build Folder` yap.
- `npm run xcode:metro` komutunu yeniden başlat.
- Xcode'da tekrar Run yap.

## Doğrulama

```bash
npm run check
npm run check:ios
```

`expo-doctor` uygulama ve SDK uyumunu kontrol eder. `expo export` ise JavaScript bundle tarafında hızlı bir paketleme kontrolü sağlar.

## App Store Build

App Store'a gidecek üretim build'i için EAS kullanılır:

```bash
npm run eas:login
npm run build:ios
```

İlk çalıştırmada Expo/EAS, Apple Developer hesabı ve sertifika/provisioning bilgileri için yönlendirme yapar. Build tamamlandıktan sonra App Store Connect'e gönderim için:

```bash
npm run submit:ios
```

## Yayın Modu

Yayın öncesi yerel kontrol:

```bash
npm run check
npm run check:ios
```

Ardından EAS hesabına giriş yap:

```bash
npm run eas:login
```

Girişten sonra TestFlight/App Store için production build:

```bash
npm run build:ios
```

Build TestFlight'ta test edildikten sonra gönderim:

```bash
npm run submit:ios
```

App Store Connect'e girilecek açıklama, anahtar kelime, gizlilik ve ekran görüntüsü notları `APP_STORE.md` içinde tutulur. Privacy/support URL için yayınlanabilir HTML taslakları `store-web/privacy.html` ve `store-web/support.html` dosyalarındadır.

## Yayın Yolunda Notlar

- Görünen uygulama adı: `İşlem`
- Geçici iOS bundle id: `com.aydin.islem`
- Geçici Android package: `com.aydin.islem`
- Uygulama kullanıcı hesabı, reklam veya analitik toplamıyor; yalnızca cihazda en iyi skoru saklıyor.
- App Store Connect'te privacy label için "veri toplanmıyor" çizgisi uygun görünüyor, ama son beyan yayıncı hesabındaki gerçek SDK ve servis kullanımına göre yapılmalı.
- `PRIVACY.md` gizlilik politikası taslağıdır; App Store Connect için web'de yayınlanıp URL olarak girilmeli.
- App Store öncesinde bundle id, ikon, ekran görüntüleri, gizlilik politikası URL'si ve yaş derecelendirmesi netleştirilmeli.
