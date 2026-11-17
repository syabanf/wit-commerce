import { storeHost } from '@rc/fixtures'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { paths } from '../lib/paths'
import { useTitle } from '../lib/useTitle'
import { useShop } from '../state/shop'

// The privacy notice UU PDP Pasal 21 asks for, in Bahasa Indonesia, built from the store's own data.
// The retention periods follow PP 80/2019 Pasal 25. Keep it in step with docs/compliance.md.

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="sf-display text-xl font-bold">{title}</h2>
      {children}
    </section>
  )
}

const list = 'list-disc space-y-1 pl-5'

/** Kebijakan privasi toko: siapa pengendali data, apa yang dikumpulkan, untuk apa dan berapa lama. */
export function PrivacyPage() {
  const { tenant, store } = useShop()
  useTitle(`Kebijakan Privasi · ${tenant.name}`)
  const host = storeHost(tenant)

  return (
    <article className="max-w-3xl space-y-8 md:pt-12 leading-relaxed mx-auto">
      <header className="space-y-2">
        <h1 className="sf-display text-3xl font-bold">Kebijakan Privasi</h1>
        <p className="text-[color:var(--sf-muted)]">
          Kebijakan ini menjelaskan bagaimana {tenant.name} mengumpulkan, memakai, menyimpan dan menghapus
          data pribadi Anda saat Anda berbelanja di {host}, sesuai Undang-Undang Nomor 27 Tahun 2022 tentang
          Pelindungan Data Pribadi (UU PDP) dan Peraturan Pemerintah Nomor 80 Tahun 2019 tentang Perdagangan
          Melalui Sistem Elektronik.
        </p>
      </header>

      <Section title="1. Pengendali data">
        <p>
          Pengendali data pribadi Anda adalah {tenant.name}, pedagang yang menjual melalui toko {host}. Toko
          ini berjalan di platform WIT Commerce, yang memproses data atas nama {tenant.name} sebagai prosesor
          data.
        </p>
      </Section>

      <Section title="2. Data yang kami kumpulkan">
        <ul className={list}>
          <li>Identitas dan kontak: nama, alamat email dan nomor telepon.</li>
          <li>Pengiriman: kota dan alamat tujuan, serta nomor resi dari kurir.</li>
          <li>
            Transaksi: barang yang dibeli, harga, potongan, ongkos kirim, cara bayar, status pembayaran dan
            riwayat pesanan serta retur.
          </li>
          <li>Akun: kata sandi dalam bentuk hash, poin loyalitas, tingkat keanggotaan dan wishlist.</li>
          <li>
            Persetujuan: jawaban Anda soal penawaran dan kabar terbaru, kapan dan di mana Anda memberikannya.
          </li>
          <li>
            Layanan: pesan yang Anda kirim ke layanan pelanggan dan catatan staf tentang permintaan Anda.
          </li>
        </ul>
      </Section>

      <Section title="3. Tujuan dan dasar pemrosesan">
        <ul className={list}>
          <li>
            Memproses pesanan, pembayaran, pengiriman, retur dan pengembalian dana. Dasarnya adalah
            pelaksanaan perjanjian jual beli dengan Anda (UU PDP Pasal 20 ayat (2) huruf b).
          </li>
          <li>
            Menyimpan catatan transaksi untuk memenuhi kewajiban hukum, termasuk PP 80/2019 Pasal 25 dan
            perpajakan (Pasal 20 ayat (2) huruf c).
          </li>
          <li>
            Mengirim email tentang pesanan Anda, seperti konfirmasi, pembayaran, pengiriman dan retur. Email
            ini bagian dari perjanjian dan tetap terkirim walau Anda menolak penawaran.
          </li>
          <li>
            Mengirim penawaran dan kabar terbaru hanya jika Anda menyetujuinya (Pasal 20 ayat (2) huruf a).
            Kotak persetujuan di halaman pembayaran tidak tercentang sejak awal, dan Anda dapat menarik
            persetujuan kapan saja lewat tautan berhenti berlangganan di setiap email penawaran atau di
            halaman akun.
          </li>
          <li>Menjaga keamanan toko, mencegah penipuan dan menjawab keluhan Anda (kepentingan yang sah).</li>
        </ul>
      </Section>

      <Section title="4. Berapa lama data disimpan">
        <ul className={list}>
          <li>
            Data yang terkait transaksi keuangan, seperti nilai pesanan, barang, cara bayar dan konfirmasi
            pembayaran, disimpan 10 tahun sejak diperoleh, sesuai PP 80/2019 Pasal 25 ayat (1) huruf a.
          </li>
          <li>
            Data perdagangan elektronik lain, seperti status pengiriman serta pengaduan dan sengketa, disimpan
            5 tahun sejak diperoleh, sesuai Pasal 25 ayat (1) huruf b.
          </li>
          <li>
            Setelah masa itu berakhir, data dihapus. Jika Anda meminta penghapusan lebih awal, nama, email,
            telepon, kota, catatan dan akun Anda langsung dihapus atau diganti dengan penanda, sehingga
            catatan yang wajib disimpan tidak lagi menunjuk kepada Anda (PP 80/2019 Pasal 59 ayat (3) dan
            (4)).
          </li>
        </ul>
      </Section>

      <Section title="5. Pihak yang memproses data dan transfer ke luar negeri">
        <ul className={list}>
          <li>WIT Commerce menjalankan toko, basis data dan server atas nama {tenant.name}.</li>
          <li>
            Resend (Amerika Serikat) mengirim email pesanan dan akun. Alamat email, nama dan isi email dikirim
            ke server Resend di Amerika Serikat.
          </li>
          <li>
            Midtrans (Indonesia) memproses pembayaran daring. Midtrans menerima jumlah tagihan dan data yang
            diperlukan untuk membayar.
          </li>
          <li>
            Saat Anda memakai asisten belanja di toko ini, pesan Anda dikirim ke penyedia model AI untuk
            dipahami. Pesan tidak memuat data pelanggan dari catatan kami, dan penyedia itu dapat berada di
            luar Indonesia.
          </li>
          <li>Kurir pilihan Anda menerima nama, telepon dan alamat pengiriman untuk mengantar paket.</li>
        </ul>
        <p>
          Untuk transfer ke luar negeri, kami memakai penyedia yang memberi pelindungan data setara atau lebih
          tinggi sesuai UU PDP Pasal 56, dengan perjanjian pemrosesan data.
        </p>
      </Section>

      <Section title="6. Hak Anda dan cara memakainya">
        <p>Sesuai UU PDP Pasal 5 sampai 13, Anda berhak untuk:</p>
        <ul className={list}>
          <li>mendapat informasi tentang pemrosesan data Anda dan salinan data tersebut;</li>
          <li>memperbaiki data yang salah atau tidak lengkap;</li>
          <li>meminta penghapusan data pribadi Anda;</li>
          <li>menarik persetujuan pemasaran kapan saja;</li>
          <li>mengajukan keberatan atau keluhan atas pemrosesan data Anda.</li>
        </ul>
        <p>
          Masuk ke{' '}
          <Link to={paths.account(store)} className="underline">
            halaman akun
          </Link>{' '}
          lalu pilih bagian Data Anda untuk meminta salinan, perbaikan atau penghapusan data. Penawaran dapat
          Anda matikan di bagian Penawaran dan kabar terbaru pada halaman yang sama.
        </p>
      </Section>

      <Section title="7. Waktu tanggapan">
        <p>
          {tenant.name} menanggapi setiap permintaan paling lambat 3x24 jam sejak permintaan diterima, sesuai
          UU PDP Pasal 30, 32, 40 dan 41. Penarikan persetujuan lewat tautan berhenti berlangganan berlaku
          saat itu juga. Penghapusan dapat menunggu sampai pesanan yang sedang dikirim atau retur yang terbuka
          selesai, karena kurir dan pengembalian dana masih memerlukan kontak Anda.
        </p>
      </Section>

      <Section title="8. Jika terjadi kebocoran data">
        <p>
          Jika data pribadi Anda bocor, {tenant.name} memberi tahu Anda dan lembaga pelindungan data pribadi
          secara tertulis paling lambat 3x24 jam, berisi data yang terungkap, kapan dan bagaimana terjadinya,
          serta langkah penanganan dan pemulihannya (UU PDP Pasal 46).
        </p>
      </Section>

      <Section title="9. Kontak">
        <p>
          Untuk pertanyaan tentang data pribadi Anda, hubungi layanan pelanggan {tenant.name} melalui {host},
          atau ajukan permintaan dari halaman akun Anda.
        </p>
      </Section>
    </article>
  )
}
