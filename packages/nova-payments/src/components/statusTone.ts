import type { StatusTone } from '@tuwaio/nova-core';

import type { CheckoutScreen } from '../utils/checkout';

/**
 * The state the strip along the top of the checkout shows: the same family of colors as the icon of each screen. A step of
 * the buyer has no strip: nothing is going on there until the buyer acts.
 *
 * @param screen - The screen shown.
 * @returns The tone, or `null` for no strip.
 * @internal
 */
export function statusToneOf(screen: CheckoutScreen): StatusTone | null {
  switch (screen) {
    case 'confirm':
      return 'pending';
    // Something needs the buyer: a running glint would say that it goes on by itself
    case 'unconfirmed':
    case 'underpaid':
      return 'warning';
    case 'paid':
      return 'success';
    case 'blocked':
    case 'error':
      return 'error';
    case 'held':
    case 'refunded':
    case 'expired':
    case 'cancelled':
    case 'replaced':
      return 'neutral';
    default:
      return null;
  }
}
