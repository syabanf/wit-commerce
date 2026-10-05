import type { PageSection } from '@rc/types'
import { useState } from 'react'
import { Drawer } from './Drawer'
import { CtaBand } from './sections'
import { TalkToSalesForm } from './TalkToSales'
import { Button } from './ui'

/** Talk to sales band: opens the lead form in a drawer. */
export function SalesBand({ section }: { section: PageSection }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <CtaBand
        section={section}
        action={
          <Button variant="light" size="lg" onClick={() => setOpen(true)}>
            {section.ctaLabel || 'Talk to sales'}
          </Button>
        }
      />
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title="Talk to sales"
        description="Tell us what you need and a sales engineer calls you back."
      >
        <TalkToSalesForm product={null} onDone={() => setOpen(false)} />
      </Drawer>
    </>
  )
}
