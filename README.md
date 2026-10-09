# FinKit — Toolkit Keuangan Harian

Aplikasi web (HTML, CSS, JavaScript murni, tanpa dependensi) yang berisi:

- **Konverter mata uang** real-time (30+ mata uang), tombol tukar, grafik tren 7H/30H/90H/1T dengan tooltip, riwayat, dan cache offline.
- **Kalkulator** dengan parser sendiri (tanpa `eval`), mode ilmiah, DEG/RAD, riwayat, dan dukungan keyboard.
- **Simulasi cicilan**: anuitas, flat, dan efektif menurun, lengkap dengan jadwal angsuran dan ekspor CSV.
- **Diskon & PPN**: harga belum/sudah termasuk PPN.
- **Split bill**: service, pajak, pembulatan per orang.
- Mode gelap/terang, responsif, dan bisa dipasang sebagai PWA.

## Menjalankan

Buka `index.html` langsung di browser, atau jalankan server lokal agar fitur PWA aktif:

```bash
npx serve .
# atau
python3 -m http.server 8080
```

## Deploy gratis

- **Netlify / Vercel**: seret-lepas folder ini, atau hubungkan repositori GitHub.
- **GitHub Pages**: push ke repo, lalu aktifkan Pages dari Settings → Pages.

## Struktur

```
index.html     struktur halaman
style.css      tema biru-putih + mode gelap
app.js         seluruh logika
sw.js          service worker (offline)
manifest.json  konfigurasi PWA
icon.svg       ikon aplikasi
```

## Sumber data

Kurs dari [Frankfurter API](https://frankfurter.dev) (data referensi Bank Sentral Eropa, gratis, tanpa API key). Kurs bukan harga jual/beli bank.

## Ide pengembangan

- Tambah konverter satuan (panjang, berat, suhu).
- Unit test untuk parser kalkulator dan rumus cicilan.
- Konversi multi-mata uang sekaligus dengan daftar favorit yang bisa diatur.
- Ekspor hasil ke PDF.
