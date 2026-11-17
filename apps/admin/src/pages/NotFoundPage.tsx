import { Button, Card, EmptyState } from '@rc/ui'
import { Compass, Lock } from 'lucide-react'
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

/** What a role with the employee area only sees on a back-office address. */
export function NoAccessPage() {
  return (
    <Card className="mt-10 max-w-lg mx-auto">
      <EmptyState
        icon={<Lock />}
        title="You do not have access to this page"
        description="Your role covers the employee area. Ask an admin of your brand for a back-office role."
        action={
          <Button asChild variant="outline">
            <Link to="/me">Back to my home</Link>
          </Button>
        }
      />
    </Card>
  )
}
