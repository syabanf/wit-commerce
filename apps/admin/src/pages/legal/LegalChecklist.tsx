import { legalMissing } from '@rc/fixtures'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@rc/ui'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/auth'
import { useScoped } from '../../state/scoped'

/** Warns the people who can fix it while shoppers cannot see who the seller is (PP 80/2019 Pasal 13). */
export function LegalChecklist() {
  const { tenant } = useScoped()
  const { can } = useAuth()
  const missing = legalMissing(tenant)
  if (!can('brand.manage') || !missing.length) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>Show shoppers who they buy from</CardTitle>
        <CardDescription>
          Indonesian law asks online sellers to show their identity and customer service. Still missing:{' '}
          {missing.join(', ')}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline">
          <Link to="/store/legal">
            Complete legal details <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
