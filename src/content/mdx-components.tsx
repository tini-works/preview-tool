/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Variant } from '@/content/Variant'

// Re-export Variant so it's available in MDX
export { Variant }

interface MdxButtonProps {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className,
}: MdxButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors',
        {
          'bg-neutral-900 text-white hover:bg-neutral-800':
            variant === 'primary',
          'bg-neutral-100 text-neutral-900 hover:bg-neutral-200':
            variant === 'secondary',
          'border border-neutral-300 bg-transparent hover:bg-neutral-50':
            variant === 'outline',
          'bg-transparent hover:bg-neutral-100': variant === 'ghost',
        },
        {
          'h-8 px-3 text-sm': size === 'sm',
          'h-10 px-4 text-sm': size === 'md',
          'h-12 px-6 text-base': size === 'lg',
        },
        className
      )}
    >
      {children}
    </button>
  )
}

interface MdxCardProps {
  children: ReactNode
  className?: string
}

export function Card({ children, className }: MdxCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-neutral-200 bg-white p-6 shadow-sm',
        className
      )}
    >
      {children}
    </div>
  )
}

interface MdxInputProps {
  placeholder?: string
  type?: string
  label?: string
  className?: string
}

export function Input({
  placeholder,
  type = 'text',
  label,
  className,
}: MdxInputProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label className="text-sm font-medium text-neutral-700">
          {label}
        </label>
      )}
      <input
        type={type}
        placeholder={placeholder}
        className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500"
      />
    </div>
  )
}

interface MdxBadgeProps {
  children: ReactNode
  variant?: 'default' | 'success' | 'warning' | 'error'
  className?: string
}

export function Badge({
  children,
  variant = 'default',
  className,
}: MdxBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        {
          'bg-neutral-100 text-neutral-800': variant === 'default',
          'bg-green-100 text-green-800': variant === 'success',
          'bg-yellow-100 text-yellow-800': variant === 'warning',
          'bg-red-100 text-red-800': variant === 'error',
        },
        className
      )}
    >
      {children}
    </span>
  )
}

interface MdxNoteProps {
  children: ReactNode
  type?: 'info' | 'warning' | 'error' | 'success'
  className?: string
}

export function Note({
  children,
  type = 'info',
  className,
}: MdxNoteProps) {
  return (
    <div
      className={cn(
        'rounded-md border-l-4 p-4 text-sm',
        {
          'border-blue-500 bg-blue-50 text-blue-800': type === 'info',
          'border-yellow-500 bg-yellow-50 text-yellow-800': type === 'warning',
          'border-red-500 bg-red-50 text-red-800': type === 'error',
          'border-green-500 bg-green-50 text-green-800': type === 'success',
        },
        className
      )}
    >
      {children}
    </div>
  )
}

/**
 * Component map provided to MDX runtime.
 * These are available in MDX files without importing.
 */
export const mdxComponents = {
  Variant,
  Button,
  Card,
  Input,
  Badge,
  Note,
}
