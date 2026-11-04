import type { PaymentsAdapter } from '../../../dist/index.js';
import { canPayWithQr } from '../../../dist/index.js';

// @ts-expect-error A type of the package: `any` would let this through
export const adapter: number = null as unknown as PaymentsAdapter;
// @ts-expect-error A function of the package: `any` would let this through
export const helper: number = canPayWithQr;
