import { Button, cn } from '@rc/ui'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router'

/**
 * Returns to the previous page when the user got here inside the app. A page opened from a
 * bookmark or a pasted link has no in-app history, so the button goes to `fallback`, usually the list.
 */
export function BackButton({ fallback, className }: { fallback: string; className?: string }) {
  const navigate = useNavigate()
  const back = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate(fallback)
  }
  return (
    <Button variant="ghost" size="sm" className={cn('-ml-1 print:hidden', className)} onClick={back}>
      <ArrowLeft />
      Back
    </Button>
  )
}
