# emass Pegadaian Admin Fee + Gram Otomatis

Struktur file:
- index.html
- assets/css/style.css
- assets/js/app.js

Deploy:
1. Upload seluruh isi folder ini ke repo aplikasi kas kamu.
2. Jangan upload ke repo pegadaian-proxy, karena repo itu khusus API Vercel.
3. Endpoint harga emas yang dipakai:
   https://pegadaian-proxy.vercel.app/api/harga-emas

Catatan update:
- Pembelian emas tetap mengurangi Saldo Bersih lewat transaksi expense kategori Tabungan Emas.
- Admin Rp2.500 tetap masuk ke total uang keluar.
- Total Beli Emas dipakai untuk hitung Gram Saat Ini: total nominal emas / harga emas sekarang.
- Total Terpotong menampilkan uang keluar termasuk admin.
