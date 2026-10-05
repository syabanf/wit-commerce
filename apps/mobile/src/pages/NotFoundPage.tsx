import { Button, Card, EmptyState } from '@rc/ui'
import { Link } from 'react-router'
import { DetailHeader } from '../layouts/DetailHeader'
import { paths } from '../lib/paths'

export function NotFoundPage() {
  return (
    <div className="space-y-5">
      <DetailHeader title="Page not found" fallback={paths.home} />
      <Card>
        <EmptyState
          title="Nothing lives at this address"
          description="The link is old or mistyped. Your store, leads and customers are one tap away."
          action={
            <Button asChild variant="outline" className="h-11">
              <Link to={paths.home}>Go home</Link>
            </Button>
          }
        />
      </Card>
    </div>
  )
}
