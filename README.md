<div align="center">

# 💰 APLIKASI SISTEM TABUNGAN MASYARAKAT & KOPERASI
### Modern Web Application • WhatsApp Bot Multi-Device • Audio Queue System • POS Thermal Receipt

[![NodeJS](https://img.shields.io/badge/Node.js-20.x-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express.js-4.x-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://prisma.io)
[![SQLite](https://img.shields.io/badge/SQLite-Database-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://sqlite.org)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![PM2](https://img.shields.io/badge/PM2-Process_Manager-2B037A?style=for-the-badge&logo=pm2&logoColor=white)](https://pm2.keymetrics.io)

<p align="center">
  <b>Sistem Pengelolaan Tabungan Warga, Sekolah, Komunitas, dan Koperasi Berbasis Digital Terintegrasi</b><br>
  Dilengkapi Bot WhatsApp Interaktif (@whiskeysockets/baileys), Mesin Antrean Mandiri Touchscreen, Panggilan Suara Otomatis (Voice Call Synthesizer), Layar Monitor TV Ruang Tunggu, Proteksi Privasi Saldo Zero-Trust QR ID, dan Cetak Struk Thermal POS (58mm / 80mm).
</p>

[Fitur Utama](#-fitur-utama-aplikasi) •
[Instalasi](#-panduan-instalasi-dari-awal) •
[Perintah WhatsApp](#-perintah-pesan-whatsapp-bot) •
[Sistem Antrean](#-sistem-antrean--panggilan-suara) •
[Menjalankan dengan PM2](#-menjalankan-di-production-menggunakan-pm2)

</div>

---

## 🌟 Fitur Utama Aplikasi

### 1. 🤖 Integrasi WhatsApp Bot Pintar (Baileys Multi-Device)
- **Notifikasi Otomatis Realtime**: Setiap setoran & penarikan otomatis mengirimkan struk mutasi detail ke WhatsApp nasabah lengkap dengan *Saldo Awal, Nominal, Saldo Akhir, dan Petugas Kasir/Admin*.
- **Perintah Interaktif Petugas**: Kasir dan Admin dapat melakukan transaksi langsung via chat WA tanpa perlu login ke web.
- **Pencarian Nama Cerdas**: Mendukung nomor rekening, nomor HP, maupun nama anggota multi-kata (Contoh: `SETOR Budi Santoso 100000`, `TARIK Siti 50000`).

### 2. 🔒 Keamanan Kasir & Perlindungan Privasi (Zero-Trust Privacy)
- **Tanpa Dropdown Terbuka**: Kasir tidak dapat melihat saldo atau mengintip rekening nasabah secara sembarangan.
- **Verifikasi QR ID Wajib**: Layar nominal dan data saldo hanya terbuka setelah kasir men-scan QR ID Anggota (via kamera webcam/HP atau USB scanner barcode fisik).

### 3. 🎫 Sistem Antrean Kios Mandiri & Panggilan Suara (Voice Audio Engine)
- **Kios Antrean Mandiri (`/antrean`)**: Layar sentuh publik bagi nasabah atau calon anggota baru untuk mengambil tiket antrean tanpa perlu login (`A`: Setor, `B`: Tarik, `C`: Daftar Rekening Baru, `D`: CS).
- **Audio Chime & Text-to-Speech**: Saat kasir memanggil antrean, sistem otomatis membunyikan bel bandara 3-nada merdu dan suara berbahasa Indonesia (*"Nomor antrean A 0 0 1, silakan menuju ke Loket Kasir 1"*).
- **Layar TV Display Monitor (`/antrean/display`)**: Tampilan layar penuh fullscreen untuk monitor TV ruang tunggu nasabah dengan sinkronisasi panggilan realtime dan jam digital.

### 4. 🖨️ Cetak Buku Tabungan & Struk Thermal POS
- **Cetak Buku Tabungan 100% Presisi (`/anggota/buku-tabungan`)**: Format mutasi buku tabungan formal tanpa terpotong margin saat dicetak.
- **Struk Thermal POS Switcher**: Pilihan cetak ukuran **58mm Mini POS** (Bluetooth portable) atau **80mm POS Desktop** (Epson, dsb) lengkap dengan QR Code validasi digital.

### 5. 👥 Multi-Role Access Control
- **👑 Super Admin**: Mengelola master data anggota, petugas kasir, laporan mutasi keuangan lengkap dengan filter petugas, export data transaksi ke file Excel/CSV, dan integrasi QR WhatsApp.
- **💼 Petugas Kasir**: Melayani loket setoran kas, tarik tunai via otorisasi QR ID, memanggil antrean loket, dan mencetak struk transaksi.
- **👤 Anggota / Nasabah**: Akses e-Passbook buku tabungan digital, pasang target impian menabung (*Savings Goal Tracker*), ambil nomor antrean loket online, dan cetak struk mandiri.

---

## 📋 Struktur Folder Proyek

```plaintext
tabungan/
├── prisma/
│   ├── dev.db                    # Database SQLite
│   └── schema.prisma             # Skema Prisma ORM (User, Transaction, Queue, Setting)
├── public/                       # Static Asset & Icon
├── src/
│   ├── config/                   # Inisialisasi Prisma & Konfigurasi
│   ├── controllers/              # Business Logic (Admin, Kasir, Anggota, Queue, Auth)
│   ├── middlewares/              # Role-Based Authentication Guard
│   ├── routes/                   # Routing Express.js
│   ├── services/                 # WhatsApp Bot Engine (Baileys Multi-Device)
│   ├── views/                    # Tampilan Antarmuka EJS & TailwindCSS
│   ├── app.js                    # Express Application Setup
│   └── server.js                 # Server Entry Point
├── ecosystem.config.js           # Konfigurasi PM2 Process Manager
├── example-env.txt               # Template Environment Variables
├── package.json
└── README.md
```

---

## 🚀 Panduan Instalasi dari Awal

Ikuti langkah-langkah berikut untuk menginstal dan menjalankan aplikasi di komputer lokal maupun server VPS:

### Prasyarat Sistem
- **Node.js**: Versi `v18.x` atau `v20.x` (LTS direkomendasikan)
- **NPM**: Versi bawaan Node.js
- **Git**

---

### Langkah 1: Clone Repositori
```bash
git clone https://github.com/alijayanet/tabungan.git
cd tabungan
```

### Langkah 2: Instal Dependensi Package
```bash
npm install
```

### Langkah 3: Konfigurasi Environment (`.env`)
Salin file `example-env.txt` menjadi `.env`:

*Di Windows (Command Prompt / PowerShell):*
```powershell
copy example-env.txt .env
```
*Di Linux / macOS:*
```bash
cp example-env.txt .env
```

Buka file `.env` dan sesuaikan nilainya:
```env
PORT=4001
APP_NAME="Aplikasi Tabungan Masyarakat"
SESSION_SECRET="ganti_dengan_kunci_acak_yang_panjang_dan_rahasia"

# Akun Super Admin Pertama Kali
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=admin123
ADMIN_NAME="Super Admin"
ADMIN_PHONE=6281234567890
```

### Langkah 4: Setup & Migrasi Database Prisma
Jalankan sinkronisasi database SQLite:
```bash
npx prisma db push
npx prisma generate
```

### Langkah 5: Jalankan Aplikasi dalam Mode Development
```bash
npm run dev
```

Aplikasi siap dibuka di browser melalui alamat:
👉 **[http://localhost:4001](http://localhost:4001)**

---

## 🔑 Akun Login Default

| Role | Username / Email / No. Rekening | Password | Akses URL |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `admin@example.com` | `admin123` | `/portal` atau `/login` |
| **Kasir Loket** | *(Dibuat oleh Admin di menu Kasir)* | *(Sesuai setting)* | `/portal` |
| **Anggota** | No. Rekening (contoh: `8820-2026-0001`) atau No. HP | `123456` | `/login` |

---

## 📱 Hubungkan WhatsApp Bot (Scan QR)

1. Login sebagai **Admin** ke **[http://localhost:4001/admin/dashboard](http://localhost:4001/admin/dashboard)**.
2. Buka menu **Status WhatsApp / Scan QR**.
3. Buka aplikasi WhatsApp di HP &rarr; **Perangkat Tertaut (Linked Devices)** &rarr; **Tautkan Perangkat**.
4. Scan QR Code yang tampil di layar web atau terminal.
5. Bot siap mengirim notifikasi transaksi otomatis dan merespons pesan WhatsApp!

---

## 💬 Perintah Pesan WhatsApp Bot

Petugas Kasir & Admin yang nomor WhatsApp-nya terdaftar dapat mengirim perintah berikut ke nomor bot:

| Format Pesan | Contoh Perintah | Penjelasan |
| :--- | :--- | :--- |
| `SETOR [ID/No.Rek/Nama] [Nominal] [Catatan]` | `SETOR Budi Santoso 100000 Tabungan Mingguan` | Menambah saldo tabungan anggota |
| `TARIK [ID/No.Rek/Nama] [Nominal] [Catatan]` | `TARIK Siti 50000 Keperluan Sekolah` | Melakukan pencairan saldo tabungan |
| `SALDO [ID/No.Rek/Nama]` | `SALDO Budi Santoso` | Mengecek sisa saldo tabungan nasabah |
| `INFO` / `BANTUAN` | `MENU` | Menampilkan panduan format perintah |

---

## 📢 Sistem Antrean & Panggilan Suara

| Modul Layanan | URL Akses | Deskripsi |
| :--- | :--- | :--- |
| **Kios Antrean Mandiri** | `/antrean` | Layar sentuh publik untuk masyarakat/calon anggota mengambil nomor tiket karcis fisik |
| **Layar Display TV Ruang Tunggu** | `/antrean/display` | Monitor TV ruang tunggu nasabah dengan auto-voice call synthesizer dan jam digital |
| **Pusat Antrean Loket Kasir** | `/kasir/antrean` | Tombol panggil suara, panggil ulang, dan penyelesaian pelayanan kasir |
| **Tiket Antrean Anggota** | `/anggota/antrean` | Tiket antrean online dari smartphone anggota |

---

## ⚙️ Menjalankan di Production Menggunakan PM2

Untuk penggunaan jangka panjang di server production tanpa henti (*background service*):

### 1. Instal PM2 Global
```bash
npm install -g pm2
```

### 2. Jalankan Aplikasi dengan File Konfigurasi
```bash
pm2 start ecosystem.config.js
```
*atau melalui npm script:*
```bash
npm run pm2:start
```

### 3. Perintah Monitoring & Manajemen PM2
```bash
# Cek status aplikasi
pm2 status

# Lihat live log transaksi & QR WhatsApp
pm2 logs tabungan-app

# Restart aplikasi
pm2 restart tabungan-app

# Simpan service agar otomatis jalan saat server reboot
pm2 save
pm2 startup
```

---

## 🛠️ Teknologi yang Digunakan

- **Backend**: Node.js & Express.js
- **Database & ORM**: SQLite & Prisma Client ORM
- **WhatsApp Gateway**: `@whiskeysockets/baileys` (Multi-Device Protocol)
- **Frontend Template**: EJS (Embedded JavaScript Templates)
- **Styling**: Tailwind CSS & Font Awesome 6 Icons
- **Audio Synthesizer**: Web Audio API Chime & Web SpeechSynthesis API (Bahasa Indonesia)
- **Barcode & QR Engine**: `html5-qrcode` & `qrcodejs`
- **Process Manager**: PM2

---

## 📄 Lisensi

Proyek ini dikembangkan untuk kebutuhan pencatatan dan pengelolaan tabungan masyarakat. Bebas digunakan dan dimodifikasi untuk kebaikan bersama.

**Author / Maintainer**: [Alijayanet](https://github.com/alijayanet)  
**Repository**: [https://github.com/alijayanet/tabungan](https://github.com/alijayanet/tabungan)
