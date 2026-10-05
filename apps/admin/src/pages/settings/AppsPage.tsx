import { Badge, Banner, Button, Card, IconTile, PageHeader, toast } from '@rc/ui'
import {
  Bell,
  Calculator,
  Camera,
  Gamepad2,
  Layers,
  MessagesSquare,
  PackageSearch,
  Radar,
  Search,
  ShoppingBag,
  Star,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { type AppIcon, MARKETPLACE_APPS } from './lib'

const ICON: Record<AppIcon, ReactNode> = {
  reviews: <Star />,
  search: <Search />,
  games: <Gamepad2 />,
  instagram: <Camera />,
  accounting: <Calculator />,
  channels: <Layers />,
  merchant: <ShoppingBag />,
  pixel: <Radar />,
  chat: <MessagesSquare />,
  shipping: <PackageSearch />,
}

export function AppsPage() {
  return (
    <>
      <PageHeader
        title="App marketplace"
        description="Apps that add reviews, search, ads, accounting and chat to a store. Preview the line-up and ask to hear when each one opens."
      />
      <div className="space-y-4">
        <Banner tone="info" title="The marketplace opens in a later phase">
          Installs are switched off for now. Pick Notify me and we email you when an app becomes available for
          your store.
        </Banner>
        <div className="gap-4 md:grid-cols-2 xl:grid-cols-3 grid grid-cols-1">
          {MARKETPLACE_APPS.map((app) => (
            <Card key={app.id} className="p-5 flex flex-col">
              <div className="gap-3 flex items-start justify-between">
                <IconTile>{ICON[app.icon]}</IconTile>
                <Badge variant="outline">{app.category}</Badge>
              </div>
              <h2 className="mt-4 text-base font-semibold leading-tight">{app.name}</h2>
              <p className="mt-1 text-sm flex-1 text-muted">{app.summary}</p>
              <div className="mt-4 gap-2 pt-4 flex flex-wrap items-center justify-between border-t border-border">
                <div className="min-w-0 flex flex-col">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled
                    title="Comes with the app marketplace"
                    className="self-start"
                  >
                    Install
                  </Button>
                  <span className="mt-1 text-[11px] text-muted">Comes with the app marketplace</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    toast('Request saved', {
                      description: `We will email you when ${app.name} is available.`,
                    })
                  }
                >
                  <Bell />
                  Notify me
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </>
  )
}
