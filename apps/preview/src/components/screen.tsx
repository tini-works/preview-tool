import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/* ─── Button ─── */

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors',
        {
          'bg-teal-500 text-white hover:bg-teal-600': variant === 'primary',
          'bg-cream-200 text-charcoal-500 hover:bg-cream-300': variant === 'secondary',
          'border border-cream-500 bg-transparent hover:bg-cream-100': variant === 'outline',
          'bg-transparent hover:bg-cream-200': variant === 'ghost',
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

/* ─── Card ─── */

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export function Card({ children, className, ...rest }: CardProps) {
  return (
    <div
      {...rest}
      className={cn(
        'rounded-lg border border-cream-400 bg-cream-50 p-6 shadow-sm',
        className
      )}
    >
      {children}
    </div>
  )
}

/* ─── Input ─── */

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export function Input({
  placeholder,
  type = 'text',
  label,
  className,
  ...rest
}: InputProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label className="text-sm font-medium text-charcoal-400">{label}</label>
      )}
      <input
        {...rest}
        type={type}
        placeholder={placeholder}
        className="h-10 rounded-md border border-cream-500 bg-cream-50 px-3 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
      />
    </div>
  )
}

/* ─── Badge ─── */

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: ReactNode
  variant?: 'default' | 'success' | 'warning' | 'error'
}

export function Badge({
  children,
  variant = 'default',
  className,
  ...rest
}: BadgeProps) {
  return (
    <span
      {...rest}
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        {
          'bg-cream-200 text-charcoal-500': variant === 'default',
          'bg-teal-100 text-teal-800': variant === 'success',
          'bg-yellow-100 text-yellow-800': variant === 'warning',
          'bg-coral-100 text-coral-800': variant === 'error',
        },
        className
      )}
    >
      {children}
    </span>
  )
}

/* ─── Note ─── */

interface NoteProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  type?: 'info' | 'warning' | 'error' | 'success'
}

export function Note({
  children,
  type = 'info',
  className,
  ...rest
}: NoteProps) {
  return (
    <div
      {...rest}
      className={cn(
        'rounded-md border-l-4 p-4 text-sm',
        {
          'border-teal-500 bg-teal-50 text-teal-800': type === 'info',
          'border-yellow-500 bg-yellow-50 text-yellow-800': type === 'warning',
          'border-coral-500 bg-coral-50 text-coral-800': type === 'error',
          'border-teal-600 bg-teal-50 text-teal-800': type === 'success',
        },
        className
      )}
    >
      {children}
    </div>
  )
}

/* ─── ScreenHeader ─── */

interface ScreenHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string
  subtitle?: string
}

export function ScreenHeader({ title, subtitle, className, ...rest }: ScreenHeaderProps) {
  return (
    <div
      {...rest}
      className={cn(
        'sticky top-0 z-10 flex items-center gap-3 border-b border-cream-400 bg-cream-50 px-4 py-3',
        className
      )}
    >
      <div className="flex size-8 items-center justify-center rounded-full text-slate-500 hover:bg-cream-200">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
      </div>
      <div className="flex flex-col">
        <span className="text-base font-semibold text-charcoal-500">{title}</span>
        {subtitle && (
          <span className="text-xs text-slate-500">{subtitle}</span>
        )}
      </div>
    </div>
  )
}

/* ─── ListItem ─── */

interface ListItemProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: string
  label: string
  description?: string
  required?: boolean
  selected?: boolean
  trailing?: ReactNode
}

export function ListItem({
  icon,
  label,
  description,
  required,
  selected,
  trailing,
  className,
  ...rest
}: ListItemProps) {
  return (
    <div
      {...rest}
      className={cn(
        'flex items-center gap-3 border-b border-cream-300 px-4 py-3 last:border-b-0',
        selected && 'bg-cream-100',
        className
      )}
    >
      {icon && (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-cream-200 text-sm">
          {icon}
        </span>
      )}
      <div className="flex flex-1 flex-col">
        <span className="text-sm font-medium text-charcoal-500">
          {label}
          {required && <span className="ml-1 text-coral-600">*</span>}
        </span>
        {description && (
          <span className="text-xs text-slate-500">{description}</span>
        )}
      </div>
      {trailing ?? (
        <svg className="size-4 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      )}
    </div>
  )
}

/* ─── RadioCard ─── */

interface RadioCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  selected?: boolean
}

export function RadioCard({ children, selected, className, ...rest }: RadioCardProps) {
  return (
    <div
      {...rest}
      className={cn(
        'flex items-center gap-3 rounded-lg border-2 px-4 py-3',
        selected
          ? 'border-teal-500 bg-teal-50'
          : 'border-cream-400 bg-cream-50',
        className
      )}
    >
      <span
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-full border-2',
          selected ? 'border-teal-500' : 'border-slate-300'
        )}
      >
        {selected && <span className="size-2.5 rounded-full bg-teal-500" />}
      </span>
      <span className="text-sm font-medium text-charcoal-500">{children}</span>
    </div>
  )
}

/* ─── Avatar ─── */

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  initials: string
  variant?: 'primary' | 'secondary'
  size?: 'sm' | 'md' | 'lg'
}

export function Avatar({
  initials,
  variant = 'primary',
  size = 'md',
  className,
  ...rest
}: AvatarProps) {
  return (
    <div
      {...rest}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold',
        {
          'bg-teal-100 text-teal-700': variant === 'primary',
          'bg-coral-100 text-coral-600': variant === 'secondary',
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

/* ─── Divider ─── */

interface DividerProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string
}

export function Divider({ label, className, ...rest }: DividerProps) {
  if (label) {
    return (
      <div {...rest} className={cn('flex items-center gap-3 py-2', className)}>
        <div className="h-px flex-1 bg-cream-400" />
        <span className="text-xs text-slate-400">{label}</span>
        <div className="h-px flex-1 bg-cream-400" />
      </div>
    )
  }
  return <div {...rest} className={cn('h-px bg-cream-400', className)} />
}

/* ─── Stack ─── */

interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  gap?: 'sm' | 'md' | 'lg'
}

export function Stack({ children, gap = 'md', className, ...rest }: StackProps) {
  return (
    <div
      {...rest}
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

/* ─── Textarea ─── */

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
}

export function Textarea({
  label,
  placeholder,
  value,
  maxLength,
  className,
  ...rest
}: TextareaProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label className="text-sm font-medium text-charcoal-400">{label}</label>
      )}
      <textarea
        {...rest}
        placeholder={placeholder}
        defaultValue={value}
        maxLength={maxLength}
        rows={3}
        className="rounded-md border border-cream-500 bg-cream-50 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
      />
      {maxLength && (
        <span className="self-end text-xs text-slate-400">
          {typeof value === 'string' ? value.length : 0}/{maxLength}
        </span>
      )}
    </div>
  )
}

/* ─── Footer ─── */

interface FooterProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export function Footer({ children, className, ...rest }: FooterProps) {
  return (
    <div
      {...rest}
      className={cn(
        'sticky bottom-0 border-t border-cream-400 bg-cream-50 px-4 py-3',
        className
      )}
    >
      {children}
    </div>
  )
}
