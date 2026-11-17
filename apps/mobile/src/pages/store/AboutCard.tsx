import { SELLER_BIO_MAX, SELLER_HEADLINE_MAX, type SellerProfile, initials } from '@rc/fixtures'
import type { Seller, Tenant } from '@rc/types'
import { Button, Card, FormField, Input, Textarea, toast } from '@rc/ui'
import { Camera, LoaderCircle, Lock, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { HTTP, api } from '../../lib/api'

const ACCEPT = ['image/png', 'image/jpeg', 'image/webp']
const MAX_BYTES = 5 * 1024 * 1024

/**
 * "About you": the photo, headline and bio on the seller's own store. The parent holds the draft so
 * the preview follows each keystroke. Fields the brand locks stay read-only and say why.
 */
export function AboutCard({
  seller,
  tenant,
  draft,
  onChange,
  blocker,
  dirty,
  onSave,
  onReset,
}: {
  seller: Seller
  tenant: Tenant
  draft: SellerProfile
  onChange: (draft: SellerProfile) => void
  blocker: string | null
  dirty: boolean
  onSave: () => void
  onReset: () => void
}) {
  const photoId = useId()
  const [uploading, setUploading] = useState(false)
  const copyLocked = tenant.brand.locks.headline
  const photoLocked = tenant.brand.locks.hero_image || !HTTP

  const upload = async (file: File | undefined) => {
    if (!file) return
    if (!ACCEPT.includes(file.type))
      return toast('Photo not added', { tone: 'danger', description: 'Choose a PNG, JPEG or WebP photo.' })
    if (file.size > MAX_BYTES)
      return toast('Photo not added', { tone: 'danger', description: 'Choose a photo of 5 MB or less.' })
    setUploading(true)
    try {
      const up = await api.media.upload(seller.tenantId, file, 'seller-photo')
      onChange({ ...draft, photoUrl: up.url })
    } catch (err) {
      toast('Photo not added', {
        tone: 'danger',
        description: err instanceof Error ? err.message : 'The upload failed. Try again.',
      })
    } finally {
      setUploading(false)
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <h2 className="text-base font-semibold">About you</h2>
      <div className="gap-4 flex items-center">
        {draft.photoUrl ? (
          <img src={draft.photoUrl} alt="Your photo" className="size-16 shrink-0 rounded-full object-cover" />
        ) : (
          <span
            aria-hidden="true"
            className="size-16 text-lg font-bold flex shrink-0 items-center justify-center rounded-full bg-surface"
          >
            {initials(seller.name)}
          </span>
        )}
        <div className="min-w-0 gap-2 flex flex-wrap">
          {photoLocked ? (
            <p className="gap-1.5 text-xs font-medium flex items-center text-muted">
              <Lock aria-hidden="true" className="size-3.5 shrink-0" />
              {HTTP ? 'Your brand team locked the photo.' : 'Adding a photo needs the online app.'}
            </p>
          ) : (
            <>
              <label
                htmlFor={photoId}
                className="min-h-11 gap-2 px-4 text-sm font-semibold inline-flex cursor-pointer items-center rounded-full bg-surface focus-within:ring-2 focus-within:ring-accent/40"
              >
                {uploading ? (
                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <Camera aria-hidden="true" className="size-4" />
                )}
                {uploading ? 'Uploading' : draft.photoUrl ? 'Change photo' : 'Add photo'}
                <input
                  id={photoId}
                  type="file"
                  accept={ACCEPT.join(',')}
                  className="sr-only"
                  disabled={uploading}
                  onChange={(e) => {
                    void upload(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
              </label>
              {draft.photoUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="lg"
                  onClick={() => onChange({ ...draft, photoUrl: '' })}
                  disabled={uploading}
                >
                  <Trash2 />
                  Remove
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      {copyLocked && (
        <p className="gap-1.5 text-xs font-medium flex items-center text-muted">
          <Lock aria-hidden="true" className="size-3.5 shrink-0" />
          Your brand team locked the headline and bio. Your store shows the brand's tagline.
        </p>
      )}
      <FormField
        label="Headline"
        htmlFor="about-headline"
        hint={
          copyLocked
            ? undefined
            : `${[...draft.headline].length} of ${SELLER_HEADLINE_MAX}. Empty shows your name.`
        }
      >
        <Input
          id="about-headline"
          className="min-h-11"
          value={draft.headline}
          maxLength={SELLER_HEADLINE_MAX}
          readOnly={copyLocked}
          onChange={(e) => onChange({ ...draft, headline: e.target.value })}
        />
      </FormField>
      <FormField
        label="Bio"
        htmlFor="about-bio"
        hint={copyLocked ? undefined : `${[...draft.bio].length} of ${SELLER_BIO_MAX}.`}
      >
        <Textarea
          id="about-bio"
          rows={3}
          value={draft.bio}
          maxLength={SELLER_BIO_MAX}
          readOnly={copyLocked}
          onChange={(e) => onChange({ ...draft, bio: e.target.value })}
        />
      </FormField>
      {dirty && blocker && (
        <p role="alert" className="text-sm font-medium text-danger">
          {blocker}
        </p>
      )}
      {dirty && (
        <div className="gap-2 grid grid-cols-2">
          <Button type="button" variant="card" size="lg" onClick={onReset}>
            Reset
          </Button>
          <Button type="button" size="lg" onClick={onSave} disabled={!!blocker || uploading}>
            Save
          </Button>
        </div>
      )}
    </Card>
  )
}
