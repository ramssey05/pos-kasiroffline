# POS Kasir Android / Web Offline

Project ini mempertahankan UI dan alur aplikasi dari `www/index.html`. APK menggunakan Capacitor WebView; fitur kasir tetap dijalankan oleh HTML yang sama.

## Penyimpanan

- Browser/Web: data utama tetap disimpan pada `localStorage` seperti versi web.
- APK Android: snapshot data utama disimpan ke SQLite melalui plugin `PosNativeStorage`; localStorage hanya dipakai sebagai sumber migrasi satu kali untuk data web lama. Snapshot JSON tetap mempertahankan format backup web agar file backup bisa dipindah antara Web dan APK.
- SQLite juga memiliki tabel indeks mirror untuk produk, transaksi, sesi shift, dan bill pending. UI saat ini memuat snapshot ke memori dan menyimpan snapshot saat ada perubahan; ini belum merupakan CRUD SQL langsung per baris.

## Bluetooth dan file

- Android memakai koneksi Bluetooth Classic RFCOMM/SPP native ke perangkat yang sudah dipasangkan di pengaturan Android.
- Pengiriman struk menggunakan ESC/POS bytes ke printer yang terhubung.
- Pemilih dokumen Android (SAF) dipakai untuk menyimpan/memilih backup JSON dan file Excel.
- Web tetap memakai jalur Web Bluetooth / download browser yang sudah ada.

## Build APK melalui GitHub Actions

1. Push repository ini ke branch `native-v2`.
2. Buka tab **Actions**.
3. Pilih **Build POS Kasir Android APK** lalu **Run workflow**.
4. Setelah status berhasil, buka run tersebut dan unduh artifact **POS-Kasir-Android-APK**.

Workflow menginstal dependensi, membundle bridge native, membangun aset offline, menjalankan `npx cap sync android`, lalu membangun `app-debug.apk` dengan Gradle.

## Catatan pengujian

Build CI membuktikan APK dapat dikompilasi, tetapi tidak membuktikan koneksi printer fisik. Setelah memasang APK, lakukan uji di perangkat Android: login, transaksi, restart aplikasi, restore backup web, upload/download Excel, pairing Smartcon RPP02/RPP02N, cetak struk dan struk dapur, serta deteksi printer terputus.
