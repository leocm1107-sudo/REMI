import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const fmt = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0
})

export function formatCOP(n: number | null | undefined): string {
  return fmt.format(n ?? 0)
}

export function hace(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000)
  if (seconds < 30)   return 'ahora'
  if (seconds < 60)   return 'hace un momento'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60)   return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24)     return `hace ${hours} h`
  const days = Math.floor(hours / 24)
  return `hace ${days} d`
}
