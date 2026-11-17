import { DEFAULT_RETURN_WINDOW_DAYS, LEGAL_RETURN_WORKING_DAYS, returnWindowDays } from '@rc/fixtures'
import type { ShopperEmailKind } from '@rc/types'
import { SHOPPER_EMAIL_KINDS, SHOPPER_EMAIL_LABEL } from '@rc/types'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  Switch,
  toast,
} from '@rc/ui'
import { useState } from 'react'
import { useAuth } from '../../auth/auth'
import { useScoped } from '../../state/scoped'

/** How long shoppers may ask for a return, and which emails the store sends them. */
export function ShopSettingsCard() {
  const { tenant } = useScoped()
  const days = returnWindowDays(tenant)
  const off = tenant.shopperEmailsOff ?? []
  // The draft restarts when the tenant switches or its saved settings change.
  return <ShopSettingsEditor key={`${tenant.id}:${days}:${off.join()}`} savedDays={days} savedOff={off} />
}

function ShopSettingsEditor({ savedDays, savedOff }: { savedDays: number; savedOff: ShopperEmailKind[] }) {
  const s = useScoped()
  const { can } = useAuth()
  const canManage = can('brand.manage')
  const [days, setDays] = useState(String(savedDays))
  const [off, setOff] = useState<ShopperEmailKind[]>(savedOff)
  const [saving, setSaving] = useState(false)
  const value = Number(days)
  // PP 80/2019 Pasal 69(1): a window may not undercut the legal floor; 0 turns change of mind off.
  const invalid =
    days === '' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 90 ||
    (value > 0 && value < LEGAL_RETURN_WORKING_DAYS)
  const dirty = value !== savedDays || off.join() !== savedOff.join()

  const toggle = (kind: ShopperEmailKind, on: boolean) =>
    setOff((list) => SHOPPER_EMAIL_KINDS.filter((k) => (k === kind ? !on : list.includes(k))))
  const save = async () => {
    setSaving(true)
    try {
      await s.dispatchAsync({
        type: 'tenants/setShopSettings',
        tenantId: s.tenantId,
        returnWindowDays: value,
        shopperEmailsOff: off,
      })
      toast('Returns and emails saved', {
        tone: 'success',
        description: value
          ? `Shoppers can ask for a return within ${value} days of delivery.`
          : 'Change-of-mind returns go by message. Damaged, wrong, late, defective or expired items still come back within 2 working days.',
      })
    } catch (err) {
      toast('Not saved', { tone: 'danger', description: (err as Error).message })
    }
    setSaving(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Returns and shopper emails</CardTitle>
        <CardDescription>
          Shoppers ask for a return from their order page within the window. Whatever you set, damaged, wrong,
          late, defective or expired items can come back for at least 2 working days after delivery, and the
          store pays their return shipping (PP 80/2019 Pasal 69). Emails go out only when the platform has
          email set up and the shopper gave an address.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField
          label="Return window in days"
          hint={`0 turns change-of-mind and fit returns off. ${DEFAULT_RETURN_WINDOW_DAYS} unless you change it.`}
          error={invalid ? `Enter 0, or a whole number from ${LEGAL_RETURN_WORKING_DAYS} to 90.` : undefined}
          htmlFor="return-window"
        >
          <Input
            id="return-window"
            variant="soft"
            inputMode="numeric"
            className="max-w-32"
            inputClassName="tabular-nums"
            disabled={!canManage}
            value={days}
            onChange={(e) => setDays(e.target.value.replace(/[^\d]/g, ''))}
          />
        </FormField>
        <div className="gap-2 sm:grid-cols-2 grid grid-cols-1">
          {SHOPPER_EMAIL_KINDS.map((kind) => (
            <label
              key={kind}
              className="gap-3 rounded-2xl px-4 py-3 text-sm flex items-center justify-between bg-surface-2"
            >
              <span>{SHOPPER_EMAIL_LABEL[kind]}</span>
              <Switch
                size="sm"
                aria-label={SHOPPER_EMAIL_LABEL[kind]}
                disabled={!canManage}
                checked={!off.includes(kind)}
                onCheckedChange={(on) => toggle(kind, on)}
              />
            </label>
          ))}
        </div>
        {canManage ? (
          <div className="gap-2 flex justify-end">
            <Button
              variant="outline"
              disabled={!dirty || saving}
              onClick={() => {
                setDays(String(savedDays))
                setOff(savedOff)
              }}
            >
              Reset
            </Button>
            <Button loading={saving} disabled={!dirty || invalid} onClick={save}>
              Save
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted">Your role cannot change these settings.</p>
        )}
      </CardContent>
    </Card>
  )
}
