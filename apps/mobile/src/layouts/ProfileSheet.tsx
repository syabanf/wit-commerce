import { SELLER_KIND_LABEL } from '@rc/types'
import {
  Avatar,
  Button,
  ConfirmDialog,
  KeyValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  toast,
} from '@rc/ui'
import { LogOut, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../auth/auth'
import { paths } from '../lib/paths'
import { fmtRate } from '../lib/seller'
import { useSellerScope } from '../state/scope'
import { useStore } from '../state/store'

export function ProfileSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { user, seller, tenant, storeUrl } = useSellerScope()
  const { signOut } = useAuth()
  const { reset, storageError } = useStore()
  const navigate = useNavigate()
  const [confirmReset, setConfirmReset] = useState(false)

  const leave = () => {
    onOpenChange(false)
    signOut()
    navigate(paths.login, { replace: true })
  }

  const resetDemo = () => {
    reset()
    setConfirmReset(false)
    onOpenChange(false)
    toast('Demo data reset', { description: 'Leads, customers, notes and your store are back to the seed.' })
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-w-md mx-auto">
          <div className="px-5 pt-4 flex flex-col items-center text-center">
            <Avatar name={user.name} color={user.color} size="xl" ring />
            <SheetTitle className="mt-3 text-xl font-bold">{user.name}</SheetTitle>
            <SheetDescription>
              {user.title} · {tenant.name}
            </SheetDescription>
          </div>
          <KeyValue
            bare
            labelWidth="md"
            className="mx-5 mt-4"
            items={[
              { label: 'Seller code', value: <span className="text-xs font-mono">{seller.code}</span> },
              { label: 'Kind', value: SELLER_KIND_LABEL[seller.kind] },
              { label: 'Commission', value: `${fmtRate(seller.commissionRate)} of attributed sales` },
              { label: 'Store', value: <span className="break-all">{storeUrl}</span> },
            ]}
          />
          <div className="space-y-2 px-5 pt-4">
            <Button variant="outline" size="lg" className="w-full" onClick={leave}>
              <LogOut />
              Sign out
            </Button>
            <Button
              variant="ghost"
              size="lg"
              className="w-full text-accent"
              onClick={() => setConfirmReset(true)}
            >
              <RotateCcw />
              Reset demo data
            </Button>
            {storageError && (
              <p className="pt-1 text-xs text-center text-muted">
                This phone is not saving changes. They last until you reload.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        destructive
        title="Reset the demo data?"
        description="Every lead, note, template and featured product you changed on this phone goes back to the seed."
        confirmLabel="Reset demo data"
        onConfirm={resetDemo}
      />
    </>
  )
}
