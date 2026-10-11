import { createContext } from 'react';

import type { PaymentsAdapter } from '../adapters/types';
import type { NovaPaymentsLabelOverrides } from '../i18n';
import type { NovaPaymentsProviderCustomization } from './NovaPaymentsProvider';

/** The settings `NovaPaymentsProvider` gives the checkouts below it. */
export interface NovaPaymentsSettings {
  /** The Quasar API, if set. */
  baseUrl?: string;
  /** Texts to replace in every language. */
  labels?: NovaPaymentsLabelOverrides;
  /** Customization of the labels. */
  customization?: NovaPaymentsProviderCustomization;
  /** The chain families the checkouts pay from a connected wallet on. */
  adapters?: PaymentsAdapter[];
}

/** The context of `NovaPaymentsProvider`. @internal */
export const NovaPaymentsContext = createContext<NovaPaymentsSettings>({});
