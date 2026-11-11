import { CURRENCY_LABEL, DISPLAY_CURRENCIES, type DisplayCurrency, listOf } from '@rc/fixtures'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Chip,
  ChipRow,
  toast,
} from '@rc/ui'
import { useState } from 'react'
import { useAuth } from '../../auth/auth'
import { useScoped } from '../../state/scoped'

/** The extra currencies shoppers can switch the store's prices to, as estimates. */
export function DisplayCurrenciesCard() {
  const { tenant } = useScoped()
  // The draft restarts when the tenant switches or its saved list changes.
  return (
    <CurrenciesEditor
      key={`${tenant.id}:${(tenant.displayCurrencies ?? []).join()}`}
      saved={tenant.displayCurrencies ?? []}
    />
  )
}

function CurrenciesEditor({ saved }: { saved: string[] }) {
  const s = useScoped()
  const { can } = useAuth()
  const canManage = can('brand.manage')
  const [chosen, setChosen] = useState<string[]>(saved)
  const [saving, setSaving] = useState(false)
  const dirty = chosen.join() !== saved.join()

  const toggle = (code: DisplayCurrency) =>
    setChosen((list) =>
      list.includes(code)
        ? list.filter((c) => c !== code)
        : DISPLAY_CURRENCIES.filter((c) => c === code || list.includes(c)),
    )
  const save = async () => {
    setSaving(true)
    try {
      await s.dispatchAsync({
        type: 'tenants/setDisplayCurrencies',
        tenantId: s.tenantId,
        currencies: chosen,
      })
      toast('Currencies saved', {
        tone: 'success',
        description: chosen.length
          ? `Shoppers can switch to ${listOf(chosen)}.`
          : 'Shoppers see rupiah only.',
      })
    } catch (err) {
      toast('Not saved', { tone: 'danger', description: (err as Error).message })
    }
    setSaving(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shopper currencies</CardTitle>
        <CardDescription>
          Shoppers can switch prices to these currencies as estimates. Checkout, payment, orders and email
          stay in rupiah.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ChipRow className="flex-wrap overflow-visible">
          <Chip active disabled title="Rupiah is always on">
            IDR
          </Chip>
          {DISPLAY_CURRENCIES.map((code) => (
            <Chip
              key={code}
              active={chosen.includes(code)}
              disabled={!canManage}
              title={CURRENCY_LABEL[code]}
              onClick={() => toggle(code)}
            >
              {code}
            </Chip>
          ))}
        </ChipRow>
        {canManage ? (
          <div className="gap-2 flex justify-end">
            <Button variant="outline" disabled={!dirty || saving} onClick={() => setChosen(saved)}>
              Reset
            </Button>
            <Button loading={saving} disabled={!dirty} onClick={save}>
              Save
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted">Your role cannot change the store's currencies.</p>
        )}
      </CardContent>
    </Card>
  )
}
