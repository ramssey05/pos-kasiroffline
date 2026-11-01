# Build APK otomatis POS Kasir

Project ini mempertahankan website/PWA dan menambahkan jalur Bluetooth BLE native untuk APK Android melalui Capacitor.

## Cara mengambil APK
1. Buka tab **Actions** pada repository GitHub.
2. Pilih workflow **Build POS Kasir APK**.
3. Buka hasil run yang statusnya hijau.
4. Di bagian **Artifacts**, unduh **POS-Kasir-Android-APK**.
5. Ekstrak ZIP artifact, lalu install app-debug.apk pada tablet Android.

## Bluetooth
- Website/PWA tetap memakai Web Bluetooth.
- APK Capacitor memakai plugin Bluetooth LE Android.
- Koneksi native menggunakan BLE/GATT, bukan Bluetooth Classic SPP.
- Pairing pertama kali melalui tombol Connect BT; sesudah device tersimpan, aplikasi mencoba reconnect otomatis.

## Batasan uji
APK hasil build adalah APK debug untuk pengujian, belum APK release bertanda tangan untuk distribusi Play Store. Dukungan printer bergantung pada BLE service/characteristic yang tersedia pada perangkat. Uji pairing dan cetak fisik wajib dilakukan sebelum digunakan operasional.
