#!/usr/bin/env node
// Points the imports of the built files at the entries of @tuwaio/sdk (and of @tuwaio/solana-sdk for the Solana adapter),
// and copies the styles of Nova Payments. An app that installs @tuwaio/sdk and this package then has one copy of Nova,
// Satellite, Pulsar and Orbit: their React contexts and module state work across both. Fails on an import of another
// TUWA package, so that a new import of Nova Payments cannot bring a second copy unnoticed.
import { copyFileSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ENTRIES = {
  '@tuwaio/nova-connect/hooks': '@tuwaio/sdk/nova-connect/hooks',
  '@tuwaio/nova-connect': '@tuwaio/sdk/nova-connect',
  '@tuwaio/nova-core': '@tuwaio/sdk/nova-core',
  '@tuwaio/nova-transactions/providers': '@tuwaio/sdk/nova-transactions/providers',
  '@tuwaio/nova-transactions': '@tuwaio/sdk/nova-transactions',
  '@tuwaio/orbit-core': '@tuwaio/sdk/orbit',
  '@tuwaio/orbit-solana': '@tuwaio/solana-sdk/orbit',
  '@tuwaio/pulsar-core': '@tuwaio/sdk/pulsar',
  '@tuwaio/satellite-core': '@tuwaio/sdk/satellite',
  '@tuwaio/satellite-react': '@tuwaio/sdk/satellite/react',
  // Built into this package: what still names them are type imports between its entries and the examples in the JSDoc
  '@tuwaio/nova-payments/i18n': '@tuwaio/payments-sdk/i18n',
  '@tuwaio/nova-payments/evm': '@tuwaio/payments-sdk/evm',
  '@tuwaio/nova-payments/solana': '@tuwaio/payments-sdk/solana',
  '@tuwaio/nova-payments': '@tuwaio/payments-sdk',
  '@tuwaio/quasar-sdk/checkout': '@tuwaio/payments-sdk/checkout',
};

const QUOTED_PACKAGE = /(["'])(@tuwaio\/[^"'/]+(?:\/[^"']+)?)\1/g;

/**
 * Points the imports of one built file at the entries of the SDK.
 *
 * @param {string} source - The text of the file.
 * @returns {string} The text with the imports replaced.
 * @throws When the file names a TUWA package that has no entry here.
 */
export function throughTheSdk(source) {
  return source.replace(QUOTED_PACKAGE, (whole, quote, name) => {
    if (/^@tuwaio\/(sdk|solana-sdk|payments-sdk)(\/|$)/.test(name)) return whole;
    const entry = ENTRIES[name];
    if (!entry) throw new Error(`[through-the-sdk] ${name} has no entry in @tuwaio/sdk`);
    return `${quote}${entry}${quote}`;
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = join(dirname(fileURLToPath(import.meta.url)), '../dist');
  for (const file of readdirSync(dist)) {
    if (!/\.(c?js|d\.c?ts)$/.test(file)) continue;
    const path = join(dist, file);
    writeFileSync(path, throughTheSdk(readFileSync(path, 'utf8')));
  }
  const require = createRequire(import.meta.url);
  copyFileSync(require.resolve('@tuwaio/nova-payments/dist/index.css'), join(dist, 'styles.css'));
}
