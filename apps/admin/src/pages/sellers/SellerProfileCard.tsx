import {
  SELLER_BIO_MAX,
  SELLER_HEADLINE_MAX,
  cleanSellerProfile,
  sellerProfileBlocker,
  sellerProfileOf,
} from '@rc/fixtures'
import type { Seller } from '@rc/types'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  Textarea,
  toast,
} from '@rc/ui'
import { type FormEvent, useState } from 'react'
import { useAuth } from '../../auth/auth'
import { ImageUpload } from '../../components/ImageUpload'
import { useScoped } from '../../state/scoped'

/**
 * The headline, bio and photo on the seller's personal store. Whoever manages sellers edits them
 * for anyone; a seller editing their own stays within the brand's locks. Mount with `key={seller.id}`.
 */
export function SellerProfileCard({ seller }: { seller: Seller }) {
  const s = useScoped()
  const { can } = useAuth()
  const manages = can('seller.manage')
  const [draft, setDraft] = useState(() => sellerProfileOf(seller))
  const [saving, setSaving] = useState(false)
  const locks = s.tenant.brand.locks
  const copyLocked = !manages && locks.headline
  const photoLocked = !manages && locks.hero_image
  const profile = cleanSellerProfile(draft)
  const blocker = sellerProfileBlocker(seller, profile, locks, !manages)
  const dirty = JSON.stringify(profile) !== JSON.stringify(sellerProfileOf(seller))

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (blocker || !dirty) return
    setSaving(true)
    try {
      await s.dispatchAsync({ type: 'sellers/updateProfile', id: seller.id, ...profile })
      toast('Profile saved', { tone: 'success', description: `${seller.name}'s store shows the new copy.` })
    } catch (err) {
      toast('The profile was not saved', {
        tone: 'danger',
        description: err instanceof Error ? err.message : 'The server did not answer. Try again.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Store profile</CardTitle>
        <CardDescription>
          The photo, headline and bio at the top of {seller.name}'s personal store.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} noValidate className="gap-4 md:grid-cols-[auto_minmax(0,1fr)] grid grid-cols-1">
          <FormField
            label="Photo"
            htmlFor="seller-photo"
            hint={photoLocked ? 'Your brand team locked the photo.' : 'A square photo works best.'}
          >
            <ImageUpload
              id="seller-photo"
              tenantId={seller.tenantId}
              value={draft.photoUrl || undefined}
              onChange={(url) => setDraft((d) => ({ ...d, photoUrl: url ?? '' }))}
              label={`${seller.name}'s photo`}
              shape="square"
              disabled={photoLocked}
            />
          </FormField>
          <div className="min-w-0 space-y-4">
            <FormField
              label="Headline"
              htmlFor="seller-headline"
              hint={
                copyLocked
                  ? 'Your brand team locked the headline and bio.'
                  : `${[...draft.headline].length} of ${SELLER_HEADLINE_MAX} characters. Empty shows the seller's name.`
              }
            >
              <Input
                id="seller-headline"
                value={draft.headline}
                maxLength={SELLER_HEADLINE_MAX}
                readOnly={copyLocked}
                onChange={(e) => setDraft((d) => ({ ...d, headline: e.target.value }))}
              />
            </FormField>
            <FormField
              label="Bio"
              htmlFor="seller-bio"
              hint={copyLocked ? undefined : `${[...draft.bio].length} of ${SELLER_BIO_MAX} characters.`}
            >
              <Textarea
                id="seller-bio"
                rows={3}
                value={draft.bio}
                maxLength={SELLER_BIO_MAX}
                readOnly={copyLocked}
                onChange={(e) => setDraft((d) => ({ ...d, bio: e.target.value }))}
              />
            </FormField>
            {dirty && blocker && (
              <p role="alert" className="text-sm font-medium text-danger">
                {blocker}
              </p>
            )}
            <div className="gap-2 flex flex-wrap justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={!dirty || saving}
                onClick={() => setDraft(sellerProfileOf(seller))}
              >
                Reset
              </Button>
              <Button type="submit" disabled={!dirty || !!blocker || saving}>
                {saving ? 'Saving…' : 'Save profile'}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
