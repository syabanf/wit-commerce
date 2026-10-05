import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// Teach tailwind-merge the custom radius and shadow tokens so `rounded-card` and `rounded-2xl`
// (or `shadow-card` and `shadow-none`) resolve as conflicts instead of both surviving.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ['card', 'hero', 'pill'],
      shadow: ['card', 'float', 'glow', 'up'],
    },
  },
})

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
