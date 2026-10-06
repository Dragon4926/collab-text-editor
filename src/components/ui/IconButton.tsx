import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import './ui.css';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

/**
 * A square, icon-only button. `label` is required: it becomes both the
 * accessible name (aria-label) and the native tooltip, so an icon button can
 * never be shipped without a text alternative.
 */
export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { label, active, size = 'md', className = '', children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`icon-btn icon-btn--${size} ${active ? 'is-active' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});
