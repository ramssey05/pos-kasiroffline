# POS Kasir Native Android

Project native Android baru, terpisah dari aplikasi HTML/PWA lama. Folder lama tidak dihapus atau ditimpa.

## Stack
- Kotlin + Jetpack Compose
- Room Database untuk penyimpanan offline
- Android Bluetooth API (implementasi printer BLE/SPP akan ditambahkan setelah verifikasi tipe printer)
- Android Storage Access Framework untuk impor/ekspor file pada tahap berikutnya

## Status saat ini
Tahap 1: kerangka aplikasi native, navigasi utama, halaman awal kasir, dan skema database awal.
Belum setara fitur lengkap POS lama dan belum siap dipakai operasional.

## Build
Workflow GitHub Actions akan menghasilkan APK debug dari folder ini.
