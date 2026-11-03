import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from '@rc/ui'
import { Copy } from 'lucide-react'
import { copyText } from './lib'

/** Shows a new secret, the one time the server hands it out. */
export function SecretDialog({
  title,
  secret,
  onClose,
}: {
  title: string
  secret: string
  onClose: () => void
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>This is the only time it shows. If you lose it, rotate it.</DialogDescription>
        </DialogHeader>
        <div className="gap-2 flex items-center">
          <Input
            readOnly
            aria-label="Secret"
            value={secret}
            className="min-w-0 flex-1"
            inputClassName="font-mono text-xs"
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button
            variant="outline"
            size="icon"
            aria-label="Copy the secret"
            onClick={() => copyText(secret, 'the secret')}
          >
            <Copy />
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>I have saved it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
