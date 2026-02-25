/* eslint-disable react-refresh/only-export-components */
import type { ComponentType, ReactNode } from 'react'
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

interface ScreenHeaderProps {
  title: string
  subtitle?: string
  className?: string
}

export function ScreenHeader({ title, subtitle, className }: ScreenHeaderProps) {
  return (
    <div
      className={cn(
        'sticky top-0 z-10 flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-3',
        className
      )}
    >
      <div className="flex size-8 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
      </div>
      <div className="flex flex-col">
        <span className="text-base font-semibold text-neutral-900">{title}</span>
        {subtitle && (
          <span className="text-xs text-neutral-500">{subtitle}</span>
        )}
      </div>
    </div>
  )
}

interface ListItemProps {
  icon?: string
  label: string
  description?: string
  required?: boolean
  selected?: boolean
  trailing?: ReactNode
  className?: string
}

export function ListItem({
  icon,
  label,
  description,
  required,
  selected,
  trailing,
  className,
}: ListItemProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 border-b border-neutral-100 px-4 py-3 last:border-b-0',
        selected && 'bg-neutral-50',
        className
      )}
    >
      {icon && (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-sm">
          {icon}
        </span>
      )}
      <div className="flex flex-1 flex-col">
        <span className="text-sm font-medium text-neutral-900">
          {label}
          {required && <span className="ml-1 text-red-500">*</span>}
        </span>
        {description && (
          <span className="text-xs text-neutral-500">{description}</span>
        )}
      </div>
      {trailing ?? (
        <svg className="size-4 shrink-0 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      )}
    </div>
  )
}

interface RadioCardProps {
  children: ReactNode
  selected?: boolean
  className?: string
}

export function RadioCard({ children, selected, className }: RadioCardProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border-2 px-4 py-3',
        selected
          ? 'border-teal-500 bg-teal-50'
          : 'border-neutral-200 bg-white',
        className
      )}
    >
      <span
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-full border-2',
          selected ? 'border-teal-500' : 'border-neutral-400'
        )}
      >
        {selected && (
          <span className="size-2.5 rounded-full bg-teal-500" />
        )}
      </span>
      <span className="text-sm font-medium text-neutral-900">{children}</span>
    </div>
  )
}

interface AvatarProps {
  initials: string
  variant?: 'primary' | 'secondary'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function Avatar({
  initials,
  variant = 'primary',
  size = 'md',
  className,
}: AvatarProps) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold',
        {
          'bg-teal-100 text-teal-700': variant === 'primary',
          'bg-orange-100 text-orange-600': variant === 'secondary',
        },
        {
          'size-8 text-xs': size === 'sm',
          'size-10 text-sm': size === 'md',
          'size-12 text-base': size === 'lg',
        },
        className
      )}
    >
      {initials}
    </div>
  )
}

interface DividerProps {
  label?: string
  className?: string
}

export function Divider({ label, className }: DividerProps) {
  if (label) {
    return (
      <div className={cn('flex items-center gap-3 py-2', className)}>
        <div className="h-px flex-1 bg-neutral-200" />
        <span className="text-xs text-neutral-400">{label}</span>
        <div className="h-px flex-1 bg-neutral-200" />
      </div>
    )
  }
  return <div className={cn('h-px bg-neutral-200', className)} />
}

interface StackProps {
  children: ReactNode
  gap?: 'sm' | 'md' | 'lg'
  className?: string
}

export function Stack({ children, gap = 'md', className }: StackProps) {
  return (
    <div
      className={cn(
        'flex flex-col',
        {
          'gap-2': gap === 'sm',
          'gap-4': gap === 'md',
          'gap-6': gap === 'lg',
        },
        className
      )}
    >
      {children}
    </div>
  )
}

interface TextareaProps {
  label?: string
  placeholder?: string
  value?: string
  maxLength?: number
  className?: string
}

export function Textarea({
  label,
  placeholder,
  value,
  maxLength,
  className,
}: TextareaProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label className="text-sm font-medium text-neutral-700">{label}</label>
      )}
      <textarea
        placeholder={placeholder}
        defaultValue={value}
        maxLength={maxLength}
        rows={3}
        className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500"
      />
      {maxLength && (
        <span className="self-end text-xs text-neutral-400">
          {value?.length ?? 0}/{maxLength}
        </span>
      )}
    </div>
  )
}

interface FooterProps {
  children: ReactNode
  className?: string
}

export function Footer({ children, className }: FooterProps) {
  return (
    <div
      className={cn(
        'sticky bottom-0 border-t border-neutral-200 bg-white px-4 py-3',
        className
      )}
    >
      {children}
    </div>
  )
}

/**
 * Wraps an MDX component to inject data-flow-target attribute on its root element.
 * The target format is "ComponentName:text" where text is derived from:
 * - `label` prop (for ListItem)
 * - `initials` prop (for Avatar)
 * - `title` prop (for ScreenHeader)
 * - string children (for Button, RadioCard, Badge, etc.)
 */
function extractTargetText(componentName: string, props: Record<string, unknown>): string | null {
  void componentName
  if ('label' in props && typeof props.label === 'string') return props.label
  if ('initials' in props && typeof props.initials === 'string') return props.initials
  if ('title' in props && typeof props.title === 'string') return props.title
  if ('children' in props) {
    const children = props.children
    if (typeof children === 'string') return children.trim()
  }
  return null
}

function withFlowTarget<P extends object>(
  componentName: string,
  Component: ComponentType<P>
): ComponentType<P> {
  function Wrapped(props: P) {
    const text = extractTargetText(componentName, props as Record<string, unknown>)
    const target = text ? `${componentName}:${text}` : null

    return (
      <div data-flow-target={target ?? undefined} style={{ display: 'contents' }}>
        <Component {...props} />
      </div>
    )
  }
  Wrapped.displayName = `FlowTarget(${componentName})`
  return Wrapped
}

/**
 * Component map provided to MDX runtime.
 * These are available in MDX files without importing.
 */
export const mdxComponents = {
  Variant,
  Button: withFlowTarget('Button', Button),
  Card,
  Input,
  Badge,
  Note,
  ScreenHeader: withFlowTarget('ScreenHeader', ScreenHeader),
  ListItem: withFlowTarget('ListItem', ListItem),
  RadioCard: withFlowTarget('RadioCard', RadioCard),
  Avatar: withFlowTarget('Avatar', Avatar),
  Divider,
  Stack,
  Textarea,
  Footer,
}
