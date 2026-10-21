import { cn } from '@tuwaio/nova-core';
import { useMemo } from 'react';

import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { qrPath } from '../utils/qr';
import { checkoutClassName } from './customization';

/**
 * A QR code drawn as one SVG path, or its replacement (`customization.components.QrCode`). It stays dark on white in
 * both themes: scanners read inverted codes badly.
 *
 * @internal
 */
export function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const context = useCheckoutContext();
  const classes = cn(className, checkoutClassName(context, 'qrCode'));
  const { size, path } = useMemo(() => qrPath(value), [value]);
  const Custom = context.customization.components?.QrCode;
  if (Custom) return <Custom value={value} label={label} className={classes} />;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className={cn('novapay:block novapay:rounded-[var(--tuwa-rounded-corners)]', classes)}
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#111827" />
    </svg>
  );
}
