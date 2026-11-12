// Company facts for the public site. Every page imports them from here; source: https://wit.id.

export const COMPANY = {
  name: 'WIT.ID',
  legalName: 'PT. Wahana Informasi dan Teknologi',
  tagline: 'The Digital Transformation Culture Company',
  founded: 2010,
  website: 'https://wit.id',
  services: ['Digital Services', 'Enterprise Services', 'Tech Support', 'IoT Services', 'AI Services'],
} as const

export const CONTACT = {
  email: 'business@wit.id',
  phone: '+62 22 2000 289',
  phoneHref: 'tel:+62222000289',
  hours: 'Mon-Fri 9:00-17:30, Bandung',
  enquirySubject: 'WIT Commerce enquiry',
} as const

export interface Office {
  city: string
  places: { name?: string; address: string }[]
  soon?: boolean
}

export const OFFICES: Office[] = [
  {
    city: 'Bandung',
    places: [
      { name: 'WIT Building', address: 'Otto Iskandardinata No 458' },
      { name: 'Workshop & Studio', address: 'Sukakarya II No 40' },
    ],
  },
  { city: 'Jakarta', places: [{ address: 'Rukan Permata Senayan Blok B25' }] },
  { city: 'Surabaya', places: [{ address: 'Jl. Dinoyo No.83 B, Keputran' }] },
  { city: 'Bali', places: [], soon: true },
]

export const SOCIALS = [
  { label: 'Instagram', href: 'https://instagram.com/wit.id' },
  { label: 'LinkedIn', href: 'https://id.linkedin.com/company/wit-id' },
  { label: 'YouTube', href: 'https://youtube.com/channel/UCkhLFh8eX8wj0C9qcbB6Z5g' },
  { label: 'TikTok', href: 'https://tiktok.com/@wit.id' },
] as const

/** The public pages, in header order. */
export const SITE_NAV = [
  { to: '/product', label: 'Product' },
  { to: '/solutions', label: 'Solutions' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
] as const

export const copyright = () => `© ${new Date().getFullYear()} ${COMPANY.name} · ${COMPANY.legalName}`
