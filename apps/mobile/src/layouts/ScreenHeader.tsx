import { Avatar } from '@rc/ui'
import { useState } from 'react'
import { useSellerScope } from '../state/scope'
import { ProfileSheet } from './ProfileSheet'

/** Tab screen header: muted context line, big title ending in the accent period, avatar for the profile. */
export function ScreenHeader({ context, title }: { context: string; title: string }) {
  const { user } = useSellerScope()
  const [profileOpen, setProfileOpen] = useState(false)
  return (
    <header className="gap-3 pt-3 flex items-center justify-between">
      <div className="min-w-0">
        <p className="text-sm truncate text-muted">{context}</p>
        <h1 className="mt-0.5 font-bold leading-tight tracking-tight text-[28px]">
          {title}
          <span className="text-accent">.</span>
        </h1>
      </div>
      <button
        type="button"
        aria-label="Your profile"
        onClick={() => setProfileOpen(true)}
        className="shrink-0 rounded-full transition-transform focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none active:scale-95"
      >
        <Avatar name={user.name} color={user.color} size="lg" ring />
      </button>
      <ProfileSheet open={profileOpen} onOpenChange={setProfileOpen} />
    </header>
  )
}
