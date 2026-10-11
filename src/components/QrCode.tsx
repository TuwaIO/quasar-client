import { cn } from '@tuwaio/nova-core';
import { useMemo } from 'react';

import { qrPath } from '../utils/qr';

/**
 * A QR code drawn as one SVG path. It stays dark on white in both themes: scanners read inverted codes badly.
 *
 * @internal
 */
export function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const { size, path } = useMemo(() => qrPath(value), [value]);
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className={cn('novapay:block novapay:rounded-[var(--tuwa-rounded-corners)]', className)}
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#111827" />
    </svg>
  );
}
