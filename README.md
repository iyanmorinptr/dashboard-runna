# 🥟 Runna Kitchen — Dashboard

Dashboard untuk usaha dimsum **Runna Kitchen** (Mentai · Truffle · Bolognese).

## Fitur

### 1. 💰 Finance
- Catat **pemasukan** dan **pengeluaran** (kategori: Penjualan, Bahan Baku, Kemasan, Operasional, Lainnya)
- KPI: pemasukan/pengeluaran/laba bulan ini + saldo keseluruhan
- Grafik pemasukan vs pengeluaran 6 bulan terakhir
- **Laporan penjualan** per bulan: jumlah order, total pcs terjual, omzet, rincian per varian dan per paket

### 2. 📦 Stock
- Stok dimsum per varian (Mentai, Truffle, Bolognese) dalam pcs
- Penyesuaian stok (produksi baru / koreksi) + riwayat pergerakan stok
- Peringatan otomatis: **⚠️ Stok menipis** (< 25 pcs) dan **⛔ Habis**

### 3. 🧾 Orderan
- Input orderan: **nama, tgl pesanan, tgl pengambilan, jenis pesanan** (varian + paket + jumlah)
- Paket: **6, 8, 14, 20, 25 pcs** — harga terisi otomatis dari harga default (bisa diubah)
- Status order: Baru → Selesai / Batal
- **Sinkronisasi otomatis**: saat order ditandai *Selesai*, stok dimsum berkurang sesuai
  jumlah pcs dan pemasukan penjualan otomatis tercatat di Finance.
  Order tidak bisa diselesaikan jika stok kurang.

## Teknologi
HTML + CSS + JavaScript murni, tanpa server. Data tersimpan di **localStorage browser**
(data melekat di browser/perangkat yang dipakai — hapus data browser = data hilang,
jadi pakai satu perangkat yang sama untuk pencatatan).

## Cara menjalankan
Buka `index.html` di browser — selesai. Atau hosting gratis lewat GitHub Pages (lihat bawah).

## 🚀 Langkah upload ke repo GitHub baru

1. **Buat repo baru** di GitHub: buka <https://github.com/new>
   - Repository name: `runna-kitchen-dashboard`
   - Pilih **Public** (wajib public jika mau pakai GitHub Pages gratis)
   - Jangan centang "Add a README" (kita sudah punya)
   - Klik **Create repository**

2. **Upload lewat browser (cara paling mudah, tanpa install apa pun):**
   - Di halaman repo baru, klik **"uploading an existing file"**
   - Seret semua file folder ini (`index.html`, `styles.css`, `app.js`, `README.md`)
   - Klik **Commit changes**

   **Atau lewat terminal (jika terbiasa git):**
   ```bash
   cd runna-kitchen-dashboard
   git init
   git add .
   git commit -m "Dashboard Runna Kitchen"
   git branch -M main
   git remote add origin https://github.com/USERNAME/runna-kitchen-dashboard.git
   git push -u origin main
   ```
   (ganti `USERNAME` dengan username GitHub kamu)

3. **Aktifkan GitHub Pages** agar bisa diakses online:
   - Buka repo → **Settings** → **Pages**
   - Source: **Deploy from a branch**, Branch: **main**, folder **/ (root)** → **Save**
   - Tunggu ± 1 menit, dashboard bisa diakses di
     `https://USERNAME.github.io/runna-kitchen-dashboard/`
