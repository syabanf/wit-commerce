import { PAYMENT_WINDOW_HOURS, complaintDays, courierEta, returnWindowDays, termsVersion } from '@rc/fixtures'
import type { BusinessType, PaymentType, Tenant } from '@rc/types'
import type { CourierOption } from './checkout'

// The store's Syarat & Ketentuan (PP 80/2019 Pasal 53 and 55), generated from the brand's own data.
// The wording is Indonesian because the law requires the contract in Bahasa Indonesia. A change here
// changes what shoppers agree to: raise TERMS_REVISION in packages/fixtures/src/legal.ts and its Go twin.

export interface TermsSection {
  id: string
  title: string
  body: string[]
  /** A store page the section points to. */
  link?: { label: string; page: 'help' | 'privacy' }
}

export interface Terms {
  version: string
  sections: TermsSection[]
}

const BUSINESS_FORM: Record<BusinessType, string> = {
  perorangan: 'usaha perorangan',
  cv: 'persekutuan komanditer (CV)',
  pt: 'perseroan terbatas (PT)',
}

/** "2 sampai 3 hari", "1 hari" or "di hari yang sama". */
const etaText = (min: number, max: number) =>
  max === 0 ? 'di hari yang sama' : min === max ? `${min} hari` : `${min} sampai ${max} hari`

/** Where an unresolved dispute goes, as the brand chose; the brand's city court by default. */
export function disputeVenue(tenant: Tenant): string {
  const l = tenant.legal ?? {}
  switch (l.disputeForum ?? 'court') {
    case 'bpsk':
      return (
        l.disputeVenue ||
        'Badan Penyelesaian Sengketa Konsumen (BPSK) di kota atau kabupaten tempat tinggal Konsumen'
      )
    case 'arbitration':
      return l.disputeVenue
        ? `arbitrase melalui ${l.disputeVenue}`
        : 'arbitrase melalui Badan Arbitrase Nasional Indonesia (BANI)'
    default:
      return (
        l.disputeVenue ||
        (l.city ? `Pengadilan Negeri ${l.city}` : 'Pengadilan Negeri di wilayah tempat kedudukan Penjual')
      )
  }
}

export function buildTerms(tenant: Tenant, paymentTypes: PaymentType[], couriers: CourierOption[]): Terms {
  const l = tenant.legal ?? {}
  const seller = l.entityName ?? tenant.name
  const identity = [
    l.businessType && `berbentuk ${BUSINESS_FORM[l.businessType]}`,
    l.nib && `Nomor Induk Berusaha (NIB) ${l.nib}`,
    l.npwp && `NPWP ${l.npwp}`,
    l.address && `beralamat di ${l.address}`,
  ].filter(Boolean)
  const contact = [l.phone && `telepon atau WhatsApp ${l.phone}`, l.email && `email ${l.email}`].filter(
    Boolean,
  )
  const pays = paymentTypes.filter((t) => t.enabled)
  const online = pays.filter((t) => t.method !== 'cod').map((t) => t.name)
  const cod = pays.some((t) => t.method === 'cod')
  const days = returnWindowDays(tenant)
  const resolve = complaintDays(tenant)

  const sections: TermsSection[] = [
    {
      id: 'pihak',
      title: '1. Para pihak',
      body: [
        `Syarat & Ketentuan ini mengikat ${seller}${identity.length ? `, ${identity.join(', ')}` : ''} ("Penjual"), dengan setiap orang yang memesan Barang di toko daring ${tenant.name} ("Konsumen").`,
        contact.length
          ? `Layanan pelanggan Penjual dapat dihubungi melalui ${contact.join(' atau ')}${l.hours ? `, pada ${l.hours}` : ''}.`
          : 'Layanan pelanggan Penjual dapat dihubungi melalui formulir di halaman Bantuan & Pengaduan.',
        'Toko ini berjalan di atas platform WIT Commerce selaku penyelenggara sistem elektronik. Penjual bertanggung jawab atas Barang, harga, pengiriman, dan layanan yang ditawarkan di toko ini.',
      ],
    },
    {
      id: 'barang',
      title: '2. Barang dan harga',
      body: [
        'Spesifikasi, kondisi, dan harga setiap Barang tercantum di halaman produknya. Harga dalam rupiah dan sudah termasuk pajak. Harga dalam mata uang lain hanya perkiraan; pembayaran tetap dalam rupiah.',
        'Penjual menjamin Barang yang dijual sah untuk diperdagangkan dan sesuai dengan informasi di halaman produk.',
        'Nilai transaksi adalah total yang tercantum di halaman checkout dan di konfirmasi pesanan, terdiri dari harga Barang, potongan yang berlaku, dan ongkos kirim.',
      ],
    },
    {
      id: 'pemesanan',
      title: '3. Pemesanan dan persetujuan',
      body: [
        'Pesanan terbentuk ketika Konsumen mencentang persetujuan atas Syarat & Ketentuan dan Kebijakan Privasi, lalu menekan tombol pemesanan di halaman checkout. Konsumen menerima kode pesanan dan dapat melihat pesanannya di halaman pesanan.',
        'Toko menyimpan versi Syarat & Ketentuan yang disetujui beserta waktunya pada setiap pesanan.',
      ],
    },
    {
      id: 'pembayaran',
      title: '4. Pembayaran',
      body: [
        online.length
          ? `Metode pembayaran yang tersedia: ${online.join(', ')}${cod ? ', serta bayar di tempat (COD)' : ''}. Pilihan yang berlaku untuk pesanan tertentu tampil di halaman checkout.`
          : cod
            ? 'Pembayaran dilakukan di tempat (COD) kepada kurir saat Barang diterima.'
            : 'Metode pembayaran yang berlaku tampil di halaman checkout.',
        `Pembayaran selain COD harus diterima dalam ${PAYMENT_WINDOW_HOURS} jam sejak pesanan dibuat. Pesanan yang belum dibayar setelah batas waktu itu dibatalkan secara otomatis.`,
        ...(cod ? ['Untuk COD, Konsumen membayar total pesanan kepada kurir saat Barang diterima.'] : []),
      ],
    },
    {
      id: 'pengiriman',
      title: '5. Pengiriman',
      body: [
        couriers.length
          ? `Penjual mengirim melalui ${couriers
              .map((c) => {
                const eta = courierEta(tenant, c.id)
                return `${c.label} (perkiraan ${etaText(eta.min, eta.max)})`
              })
              .join(', ')}. Perkiraan waktu dihitung sejak paket diserahkan ke kurir.`
          : 'Pilihan kurir dan perkiraan waktu pengiriman tampil di halaman checkout.',
        'Penjual mengemas dan menyerahkan Barang ke kurir setelah pembayaran diterima, atau setelah pesanan dikonfirmasi untuk COD. Nomor resi, status pengiriman, dan perkiraan waktu tiba ditampilkan di halaman pesanan.',
        'Apabila pengiriman terlambat dari perkiraan atau Barang tidak diterima, Konsumen dapat mengajukan pengaduan. Penjual menindaklanjutinya bersama kurir.',
      ],
    },
    {
      id: 'pengembalian',
      title: '6. Pengembalian Barang',
      body: [
        days > 0
          ? `Konsumen dapat mengajukan pengembalian dalam ${days} hari sejak Barang diterima, melalui halaman pesanan, dengan memilih Barang dan alasan pengembaliannya.`
          : 'Konsumen mengajukan pengembalian melalui layanan pelanggan Penjual.',
        'Apabila Barang yang diterima tidak sesuai dengan yang diperjanjikan, misalnya rusak, salah kirim, atau tidak sesuai deskripsi, Konsumen tetap berhak mengajukan pengembalian sekurang-kurangnya dalam 2 (dua) hari kerja setelah Barang diterima, sesuai Peraturan Pemerintah Nomor 80 Tahun 2019.',
        'Penjual memeriksa pengajuan dan memberi tahu keputusannya. Barang yang disetujui dikirim kembali kepada Penjual. Setelah Barang diterima dan diperiksa, dana dikembalikan ke metode pembayaran semula sebesar harga Barang yang dikembalikan setelah potongan.',
      ],
    },
    {
      id: 'pembatalan',
      title: '7. Pembatalan',
      body: [
        'Konsumen dapat meminta pembatalan sebelum Barang dikirim dengan menghubungi layanan pelanggan Penjual. Pesanan yang sudah dibayar dan dibatalkan dikembalikan dananya secara penuh.',
        'Penjual dapat membatalkan pesanan apabila pembayaran tidak diterima dalam batas waktu, stok tidak tersedia, atau terdapat indikasi penipuan. Penjual memberi tahu Konsumen dan mengembalikan dana yang sudah dibayar secara penuh.',
      ],
    },
    {
      id: 'pengaduan',
      title: '8. Pengaduan',
      body: [
        'Konsumen dapat menyampaikan pengaduan melalui formulir di halaman Bantuan & Pengaduan, atau melalui kontak layanan pelanggan di atas. Setiap pengaduan dicatat dan ditangani oleh petugas layanan pelanggan Penjual.',
        `Penjual menyelesaikan pengaduan dalam ${resolve} hari kerja sejak pengaduan diterima, dan menyampaikan hasilnya kepada Konsumen.`,
      ],
      link: { label: 'Bantuan & Pengaduan', page: 'help' },
    },
    {
      id: 'sengketa',
      title: '9. Penyelesaian sengketa',
      body: [
        'Sengketa diselesaikan lebih dahulu secara musyawarah melalui layanan pengaduan Penjual.',
        `Apabila musyawarah tidak mencapai kesepakatan, para pihak memilih penyelesaian melalui ${disputeVenue(tenant)}, tanpa mengurangi hak Konsumen untuk menempuh upaya lain menurut Undang-Undang Nomor 8 Tahun 1999 tentang Perlindungan Konsumen.`,
        'Syarat & Ketentuan ini tunduk pada hukum Republik Indonesia.',
      ],
    },
    {
      id: 'data',
      title: '10. Data pribadi',
      body: [
        'Penjual mengolah data pribadi Konsumen untuk memproses pesanan, pengiriman, pembayaran, dan pengaduan, sesuai Kebijakan Privasi.',
      ],
      link: { label: 'Kebijakan Privasi', page: 'privacy' },
    },
  ]
  if (l.termsExtra)
    sections.push({
      id: 'tambahan',
      title: '11. Ketentuan tambahan dari Penjual',
      body: [
        ...l.termsExtra
          .split(/\n+/)
          .map((p) => p.trim())
          .filter(Boolean),
        'Ketentuan tambahan ini tidak mengurangi hak Konsumen menurut ketentuan di atas maupun menurut peraturan perundang-undangan.',
      ],
    })
  return { version: termsVersion(tenant), sections }
}
