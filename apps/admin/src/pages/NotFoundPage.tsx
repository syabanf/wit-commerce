import { Button, Card, EmptyState } from '@rc/ui'
import { Compass } from 'lucide-react'
import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <Card className="mt-10 max-w-lg mx-auto">
      <EmptyState
        icon={<Compass />}
        title="Page not found"
        description="The link may be old or the record was removed."
        action={
          <Button asChild variant="outline">
            <Link to="/">Back to home</Link>
          </Button>
        }
      />
    </Card>
  )
}
