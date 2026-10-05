import { createContext, useContext, useId, type ReactNode } from 'react'
import { cn } from '../lib/cn'

type FieldContextValue = { id: string; describedBy?: string; invalid: boolean }

const FieldContext = createContext<FieldContextValue | null>(null)

/**
 * Wiring for the control inside a FormField: the label's id, the hint or error as its
 * description, and the error state. Explicit props on the control win.
 */
export function useFieldControl(id?: string, describedBy?: string) {
  const field = useContext(FieldContext)
  return {
    id: id ?? field?.id,
    describedBy: describedBy ?? field?.describedBy,
    invalid: field?.invalid ?? false,
  }
}

export type FormFieldProps = {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  required?: boolean
  /** Id of the control. Defaults to a generated id that Input, Textarea, NativeSelect, Combobox and Switch pick up. */
  htmlFor?: string
  className?: string
  children: ReactNode
}

/** Label, one control and one helper line. An error replaces the hint. */
export function FormField({
  label,
  hint,
  error,
  required = false,
  htmlFor,
  className,
  children,
}: FormFieldProps) {
  const generatedId = useId()
  const controlId = htmlFor ?? generatedId
  const messageId = `${controlId}-message`
  const hasError = error !== undefined && error !== null && error !== false && error !== ''
  const message = hasError ? error : hint

  return (
    <div className={cn('min-w-0 flex flex-col', className)}>
      {label !== undefined && (
        <label htmlFor={controlId} className="mb-1.5 text-sm font-medium block text-foreground">
          {label}
          {required && (
            <span aria-hidden="true" className="ml-0.5 text-accent">
              *
            </span>
          )}
        </label>
      )}
      <FieldContext
        value={{
          id: controlId,
          describedBy: message === undefined ? undefined : messageId,
          invalid: hasError,
        }}
      >
        {children}
      </FieldContext>
      {message !== undefined && (
        <p id={messageId} className={cn('mt-1 text-xs', hasError ? 'text-danger' : 'text-muted')}>
          {message}
        </p>
      )}
    </div>
  )
}
