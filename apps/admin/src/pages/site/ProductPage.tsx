import { cn } from '@rc/ui'
import type { ComponentType } from 'react'
import { Link } from 'react-router'
import { STORE_ROOT } from '../../lib/storefront'
import { buttonClass, Checklist, CtaBand, Dot, Kicker, PageHero, usePageMeta, ConsoleLink } from './parts'
import { Reveal } from './Reveal'
import {
  AssistantSketch,
  CheckoutSketch,
  CustomerSketch,
  EditorSketch,
  OperationsSketch,
  PlatformSketch,
  SellerSketch,
} from './sketches'

interface Area {
  id: string
  kicker: string
  title: string
  body: string
  points: string[]
  Sketch: ComponentType
}

const AREAS: Area[] = [
  {
    id: 'builder',
    kicker: 'Store builder',
    title: 'Edit the store by clicking on it',
    body: 'Click any part of the page to change its words, pictures and buttons, then press Publish.',
    points: [
      'Changes to a live page wait in a draft until you publish',
      'Pick a look, then set the logo, colours and fonts',
      `Every store opens on its own address on ${STORE_ROOT}`,
    ],
    Sketch: EditorSketch,
  },
  {
    id: 'payments',
    kicker: 'Selling and payments',
    title: 'Take the payments shoppers already use',
    body: 'Connect Midtrans and the checkout offers QRIS, virtual accounts, GoPay and cards. The order turns paid when the money arrives.',
    points: [
      'Cash on delivery and manual bank transfer work without Midtrans',
      'Shoppers can see prices in their own currency as an estimate',
      'You still sell and report in rupiah',
    ],
    Sketch: CheckoutSketch,
  },
  {
    id: 'operations',
    kicker: 'Operations',
    title: 'One queue from paid to delivered',
    body: 'Orders move through one queue: pack, ship, and handle cancellations, refunds and returns.',
    points: [
      'Stock for every product across all your warehouses',
      'Receipts, adjustments and transfers kept as stock moves',
      'Returns and refunds logged as service tickets',
    ],
    Sketch: OperationsSketch,
  },
  {
    id: 'customers',
    kicker: 'Customers and marketing',
    title: 'Know each customer and talk to the right ones',
    body: 'Customer 360 puts orders, tickets, loyalty points and segments on one record.',
    points: [
      'Segments by orders, spend, tier, city or abandoned cart',
      'Loyalty points and tiers, from member to platinum',
      'Campaigns by email, WhatsApp, push and SMS, plus promotions',
      'Automations that start on sign-up, a first order or a birthday',
    ],
    Sketch: CustomerSketch,
  },
  {
    id: 'sales',
    kicker: 'Sales network',
    title: 'Let your sellers sell for you',
    body: 'Each seller gets a personal store page and a phone app with their own orders, customers and leads.',
    points: [
      'Referral links credit the seller for every order they bring',
      'Leads move from new to won in the console and on the phone',
      'Sales performance for each seller in one table',
    ],
    Sketch: SellerSketch,
  },
  {
    id: 'assistant',
    kicker: 'AI assistant',
    title: 'Ask your store a question',
    body: 'The assistant answers from your own sales, stock, orders and campaigns, and suggests what to do next.',
    points: [
      'Every action it suggests waits for you to press Confirm',
      'It only offers what your role is allowed to do',
      'Customer emails, phones and addresses never reach the model',
    ],
    Sketch: AssistantSketch,
  },
  {
    id: 'platform',
    kicker: 'Platform',
    title: 'Built to connect and to share safely',
    body: 'Orders, stock and customers update on every open screen as they change.',
    points: [
      'Roles for owners, operations, marketing, service and sales',
      'API keys and webhooks for orders, customers, products and stock',
      'Each role sees only the records it needs',
    ],
    Sketch: PlatformSketch,
  },
]

export function ProductPage() {
  usePageMeta(
    'Product · WIT Commerce',
    'The store builder, payments, operations, customers, sales network, AI assistant and platform of WIT Commerce.',
  )
  return (
    <>
      <PageHero
        kicker="Product"
        title="One console for the whole store"
        lead="Build the store, take payments, ship orders and grow your customers from one place. Here is what each part does."
      >
        <nav aria-label="Product areas" className="gap-2 flex flex-wrap">
          {AREAS.map((a) => (
            <a
              key={a.id}
              href={`#${a.id}`}
              className="press bg-white px-4 py-2 text-sm font-semibold rounded-full shadow-card hover:bg-surface-2"
            >
              {a.kicker}
            </a>
          ))}
        </nav>
      </PageHero>
      <div className="space-y-6 px-4 pb-10 sm:px-6 lg:space-y-10">
        {AREAS.map((a, i) => (
          <AreaRow key={a.id} area={a} flip={i % 2 === 1} />
        ))}
      </div>
      <section aria-labelledby="start-title" className="px-4 py-10 sm:px-6">
        <Reveal className="max-w-6xl mx-auto text-center">
          <h2 id="start-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
            See it with your own products
            <Dot />
          </h2>
          <div className="mt-6 gap-2 flex flex-wrap justify-center">
            <Link to="/start" className={buttonClass('red')}>
              Create your store
            </Link>
            <ConsoleLink className={buttonClass('white')}>Try the demo</ConsoleLink>
          </div>
        </Reveal>
      </section>
      <CtaBand />
    </>
  )
}

function AreaRow({ area, flip }: { area: Area; flip: boolean }) {
  return (
    <section
      id={area.id}
      aria-labelledby={`${area.id}-title`}
      className="max-w-6xl scroll-mt-24 gap-8 py-10 lg:grid-cols-2 lg:gap-16 mx-auto grid grid-cols-1 items-center"
    >
      <Reveal className={cn(flip && 'lg:order-2')}>
        <Kicker>{area.kicker}</Kicker>
        <h2
          id={`${area.id}-title`}
          className="mt-3 text-3xl leading-tight font-bold tracking-tight sm:text-4xl"
        >
          {area.title}
          <Dot />
        </h2>
        <p className="mt-4 text-lg text-body">{area.body}</p>
        <div className="mt-6">
          <Checklist items={area.points} />
        </div>
      </Reveal>
      <Reveal delay={120} className={cn('min-w-0', flip && 'lg:order-1')}>
        <area.Sketch />
      </Reveal>
    </section>
  )
}
