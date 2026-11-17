# SOP Insiden Data Pribadi

Prosedur ini berlaku untuk setiap dugaan kebocoran data pribadi di WIT Commerce: data pelanggan sebuah
brand, data staf, atau data yang dipegang prosesor kami (Resend, Midtrans, penyedia model AI). Dasar
hukumnya UU Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP) Pasal 46 dan PP 80/2019
Pasal 59 ayat (2) huruf g.

Brand (Pedagang) adalah pengendali data pelanggannya. WIT Commerce adalah prosesor yang menjalankan
toko atas nama brand. Karena itu WIT Commerce memberi tahu brand secepatnya, dan brand memberi tahu
pelanggan serta lembaga. Jika brand meminta, WIT Commerce menyiapkan dan mengirim pemberitahuan atas nama
brand.

Batas waktu: **3x24 jam sejak kegagalan pelindungan data diketahui** untuk pemberitahuan tertulis kepada
subjek data dan lembaga (Pasal 46 ayat (1)). Hitung jam dari saat pertama seseorang di tim mengetahui
dugaan itu, bukan dari saat penyelidikan selesai.

## Peran

| Peran | Tugas |
| --- | --- |
| Penanggung jawab insiden | Memimpin, memutuskan, mencatat waktu setiap langkah. Default: kepala engineering yang sedang bertugas. |
| Engineer | Menahan kebocoran, mengumpulkan bukti, memperbaiki. |
| Kontak brand | Menghubungi pemilik setiap brand yang terdampak. |
| Penasihat hukum | Memeriksa isi pemberitahuan dan kewajiban lain. |

Penunjukan Pejabat Pelindungan Data Pribadi (UU PDP Pasal 53) adalah keputusan operator dan belum
diatur di dokumen ini. Setelah ditunjuk, pejabat itu menjadi penanggung jawab insiden.

## 1. Deteksi (jam 0)

Tanda yang memicu prosedur ini:

- laporan dari pelanggan, brand, peneliti keamanan atau prosesor;
- akses tak wajar di log: `request_log` (permintaan per prinsipal), `credential_events` (kunci API dan
  webhook), `staff_events` (akun staf), lonjakan 401 atau 403;
- kunci API, `JWT_SECRET`, `CREDENTIALS_KEY` atau kunci Resend dan Midtrans terlihat di tempat yang tidak
  semestinya (repositori, log, tiket, chat);
- cadangan basis data atau ekspor yang hilang atau dibagikan ke pihak yang salah;
- email pesanan yang terkirim ke alamat yang salah dalam jumlah besar.

Langkah:

1. Catat waktu diketahui, siapa yang melapor dan apa yang dilaporkan di catatan insiden (lihat bagian 5).
2. Tunjuk penanggung jawab insiden.
3. Tetapkan tenggat: waktu diketahui + 72 jam. Tulis tenggat itu di baris pertama catatan insiden.

## 2. Penahanan (target: jam 0 sampai 4)

Pilih yang sesuai. Jangan hapus bukti.

- Cabut kunci API yang bocor dari halaman Credentials, atau `POST /credentials/{id}/revoke`.
- Ganti `JWT_SECRET` untuk mengakhiri semua sesi staf dan pembeli sekaligus. Semua orang harus masuk lagi.
- Nonaktifkan akun staf yang disalahgunakan (`POST /users/{id}/status`); token mereka berhenti saat itu
  juga.
- Putar rahasia webhook (`POST /webhooks/{id}/rotate`) dan matikan endpoint yang mencurigakan.
- Ganti kunci Resend dan Midtrans di dasbor penyedia, lalu simpan kunci baru di pengaturan.
- Tutup akses jaringan ke Postgres dari luar jika itu jalurnya.
- Salin log yang relevan ke tempat aman sebelum dirotasi.

## 3. Penilaian (target: jam 4 sampai 24)

Jawab pertanyaan ini di catatan insiden:

1. Data apa yang terungkap? Nama, email, telepon, kota, riwayat pesanan, hash kata sandi, catatan staf,
   kunci.
2. Brand mana dan berapa pelanggan? Hitung per brand dari tabel `customers` dan `orders`.
3. Kapan mulai dan berakhir, dan bagaimana terjadinya?
4. Apakah data terenkripsi atau berbentuk hash? Hash kata sandi (PBKDF2) dan rahasia konektor (AES-256-GCM)
   menurunkan risiko, tetapi tetap dicatat.
5. Seberapa besar risiko bagi pelanggan: penipuan, phishing, kerugian uang, malu?
6. Apakah kebocoran mengganggu pelayanan publik atau berdampak serius bagi kepentingan masyarakat? Jika
   ya, pemberitahuan juga harus diumumkan ke masyarakat (Pasal 46 ayat (3)).

Jika ada keraguan apakah data pribadi terungkap, anggap terungkap dan lanjutkan ke pemberitahuan.

## 4. Pemberitahuan (paling lambat jam 72)

Kirim pemberitahuan **tertulis** kepada:

- setiap pelanggan yang datanya terungkap, lewat email dan di halaman akun mereka;
- lembaga penyelenggara pelindungan data pribadi (UU PDP Pasal 58), atau Kementerian Komunikasi dan
  Digital selama lembaga itu belum terbentuk;
- setiap brand yang terdampak, sebelum pelanggan mereka menerima email;
- masyarakat, jika penilaian langkah 3 nomor 6 menjawab ya.

Isi wajib menurut Pasal 46 ayat (2):

a. data pribadi yang terungkap;
b. kapan dan bagaimana data pribadi terungkap;
c. upaya penanganan dan pemulihan atas terungkapnya data pribadi oleh pengendali.

Tambahkan juga apa yang sebaiknya dilakukan pelanggan dan kontak untuk bertanya.

Kirim email lewat antrean `email_outbox` seperti email pembeli lainnya, dengan nama dan warna brand.
Email ini adalah pemberitahuan wajib, bukan pemasaran, jadi terkirim juga kepada pelanggan tanpa
persetujuan pemasaran. Jangan menyertakan data yang bocor di dalam email itu sendiri.

### Templat pemberitahuan kepada pelanggan

```
Subjek: Pemberitahuan insiden data pribadi di {nama brand}

Yth. {nama pelanggan},

Pada {tanggal dan jam WIB} kami mengetahui bahwa {uraian singkat kejadian, misalnya: pihak tanpa izin
mengakses salinan basis data pelanggan}. Kami memberi tahu Anda sesuai UU Nomor 27 Tahun 2022 Pasal 46.

Data yang terungkap:
- {daftar data, misalnya: nama, alamat email, nomor telepon, kota pengiriman, riwayat pesanan}
- {sebutkan juga yang tidak terungkap, misalnya: kata sandi tersimpan dalam bentuk hash dan data kartu
  tidak pernah kami simpan}

Kapan dan bagaimana:
{tanggal mulai} sampai {tanggal berakhir}. {penjelasan bagaimana terjadinya, dalam bahasa sederhana}

Yang sudah kami lakukan:
- {langkah penahanan, misalnya: menutup akses, mengganti semua kunci, mengakhiri semua sesi}
- {langkah pemulihan dan pencegahan}

Yang sebaiknya Anda lakukan:
- Waspadai email, SMS atau telepon yang mengaku dari {nama brand} dan meminta kata sandi atau kode OTP.
  Kami tidak pernah memintanya.
- {jika relevan: ganti kata sandi Anda di {alamat toko}/account}

Pertanyaan atau permintaan tentang data Anda: {email atau kontak layanan pelanggan}, atau dari halaman
akun Anda. Kami menjawab paling lambat 3x24 jam.

Hormat kami,
{nama brand}
```

### Templat pemberitahuan kepada lembaga

```
Kepada: {lembaga pelindungan data pribadi / Kementerian Komunikasi dan Digital}
Perihal: Pemberitahuan kegagalan pelindungan data pribadi

Pengendali data: {nama brand}, {alamat}, {kontak}
Prosesor: WIT Commerce, {alamat}, {kontak}

1. Data pribadi yang terungkap: {jenis data}, {jumlah subjek data}, {jumlah brand}
2. Kapan dan bagaimana: {waktu diketahui}, {rentang waktu kejadian}, {uraian}
3. Upaya penanganan dan pemulihan: {penahanan}, {perbaikan}, {pemberitahuan kepada subjek data pada
   tanggal ...}
4. Kontak penanggung jawab: {nama}, {jabatan}, {email}, {telepon}
```

## 5. Pencatatan

Satu catatan per insiden, disimpan minimal 5 tahun (PP 80/2019 Pasal 25 ayat (1) huruf b), berisi:

- waktu diketahui, tenggat 72 jam, dan waktu setiap langkah;
- siapa yang menangani;
- hasil penilaian langkah 3;
- salinan setiap pemberitahuan yang dikirim, kepada siapa dan kapan;
- bukti yang disimpan dan di mana.

Catatan insiden tidak boleh memuat data pribadi yang bocor. Rujuk pelanggan dengan kode pelanggan,
bukan nama atau email.

## 6. Tinjauan (paling lambat 14 hari setelah insiden ditutup)

1. Tulis kronologi dan akar masalah tanpa menyalahkan orang.
2. Tetapkan perbaikan dengan pemilik dan tanggal.
3. Perbarui SOP ini, runbook, dan `docs/compliance.md` jika ada yang berubah.
4. Latih ulang tim: jalankan simulasi insiden minimal sekali setahun.
