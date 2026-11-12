import { type Industry, INDUSTRY_LABEL, type Role } from '@rc/types'
import { cn } from '@rc/ui'
import {
  Coffee,
  Cpu,
  Factory,
  Footprints,
  Headset,
  LineChart,
  type LucideIcon,
  Megaphone,
  Shirt,
  Sparkles,
  Truck,
  UserRound,
} from 'lucide-react'
import { CtaBand, Dot, Kicker, PageHero, SectionHead, usePageMeta } from './parts'
import { Reveal } from './Reveal'

const INDUSTRY_FIT: Record<Industry, { icon: LucideIcon; body: string }> = {
  sport: {
    icon: Footprints,
    body: 'Sizes and colours as variants, stock per warehouse, and sellers who sell to their running club through referral links.',
  },
  beauty: {
    icon: Sparkles,
    body: 'Loyalty tiers and birthday automations bring customers back, and segments find who is due to reorder.',
  },
  industrial: {
    icon: Factory,
    body: 'A sales team works leads from first contact to won, and buyers can pay by virtual account or bank transfer.',
  },
  fnb: {
    icon: Coffee,
    body: 'Modifiers for add-ons, QRIS and GoPay at checkout, and promotions such as bundles or buy one get one.',
  },
  fashion: {
    icon: Shirt,
    body: 'Collections for each drop, a visual editor for the look of the store, and campaigns by email and WhatsApp.',
  },
  electronics: {
    icon: Cpu,
    body: 'Product attributes for specs, returns and refunds handled as service tickets, and stock across warehouses.',
  },
}

interface Team {
  role: Role
  icon: LucideIcon
  title: string
  body: string
  does: string[]
}

// One card per role in packages/fixtures/src/permissions.ts; owners are the tenant admin.
const TEAMS: Team[] = [
  {
    role: 'tenant_admin',
    icon: UserRound,
    title: 'Owners',
    body: 'Run the whole brand from one login.',
    does: ['Brand look and store', 'Catalog, customers and campaigns', 'Users, roles and integrations'],
  },
  {
    role: 'operations',
    icon: Truck,
    title: 'Operations',
    body: 'Keep the catalog and stock right and get orders out.',
    does: ['Products and stock', 'Pack and ship orders', 'Refunds'],
  },
  {
    role: 'marketing',
    icon: Megaphone,
    title: 'Marketing',
    body: 'Find the right customers and bring them back.',
    does: ['Segments and campaigns', 'Automations and promotions', 'Store pages and analytics'],
  },
  {
    role: 'service',
    icon: Headset,
    title: 'Customer service',
    body: 'Answer customers and fix what went wrong.',
    does: ['Tickets', 'Returns and refunds', 'Customer records and leads'],
  },
  {
    role: 'sales',
    icon: LineChart,
    title: 'Sales',
    body: 'Sell from a personal store and a phone app.',
    does: ['Assigned leads', 'Their own customers', 'A personal storefront'],
  },
]

export function SolutionsPage() {
  usePageMeta(
    'Solutions · WIT Commerce',
    'How WIT Commerce fits sport, beauty, industrial, food, fashion and electronics brands, and each team that runs them.',
  )
  return (
    <>
      <PageHero
        kicker="Solutions"
        title="Made for how you sell"
        lead="Pick what you sell when you open the store, and each team gets the part of the console it works in."
      />
      <section aria-labelledby="industries-title" className="px-4 py-16 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <SectionHead
            kicker="By business type"
            id="industries-title"
            title="Your trade, set up from day one"
          />
          <ul className="mt-10 gap-4 sm:grid-cols-2 lg:grid-cols-3 grid grid-cols-1">
            {(Object.keys(INDUSTRY_LABEL) as Industry[]).map((key, i) => {
              const fit = INDUSTRY_FIT[key]
              return (
                <Reveal as="li" key={key} delay={(i % 3) * 80}>
                  <article className="lift p-6 flex h-full flex-col rounded-card bg-card shadow-card">
                    <span className="size-11 grid place-items-center rounded-[13px] bg-accent-soft text-accent">
                      <fit.icon className="size-5" aria-hidden />
                    </span>
                    <h3 className="mt-5 text-lg font-semibold tracking-tight">{INDUSTRY_LABEL[key]}</h3>
                    <p className="mt-2 text-sm text-body">{fit.body}</p>
                  </article>
                </Reveal>
              )
            })}
          </ul>
        </div>
      </section>
      <section aria-labelledby="teams-title" className="px-4 py-16 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <SectionHead
            kicker="By team"
            id="teams-title"
            title="Each role sees what it needs"
            lead="Every person signs in with a role. The console shows the pages and actions that role is allowed to use."
          />
          <ul className="mt-10 gap-4 md:grid-cols-2 lg:grid-cols-6 grid grid-cols-1">
            {TEAMS.map((t, i) => (
              <Reveal
                as="li"
                key={t.role}
                delay={(i % 3) * 80}
                className={i < 2 ? 'lg:col-span-3' : 'lg:col-span-2'}
              >
                <TeamCard team={t} onInk={i === 0} />
              </Reveal>
            ))}
          </ul>
        </div>
      </section>
      <CtaBand />
    </>
  )
}

/** The owners' card is the region's one ink surface; the rest are white. */
function TeamCard({ team, onInk }: { team: Team; onInk: boolean }) {
  return (
    <article
      className={cn(
        'lift p-6 flex h-full flex-col rounded-card',
        onInk ? 'text-white bg-ink shadow-float' : 'bg-card shadow-card',
      )}
    >
      <team.icon className="mb-5 size-6 text-accent" aria-hidden />
      <Kicker onDark={onInk}>For</Kicker>
      <h3 className="mt-1 text-2xl font-bold tracking-tight">
        {team.title}
        <Dot />
      </h3>
      <p className={cn('mt-2', onInk ? 'text-on-ink-muted' : 'text-body')}>{team.body}</p>
      <ul className="mt-5 gap-1.5 flex flex-wrap">
        {team.does.map((d) => (
          <li
            key={d}
            className={cn(
              'px-3 py-1 text-xs font-semibold rounded-full',
              onInk ? 'bg-white/10' : 'bg-surface',
            )}
          >
            {d}
          </li>
        ))}
      </ul>
    </article>
  )
}
