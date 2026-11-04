import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ENTRIES, throughTheSdk } from '../../scripts/through-the-sdk.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const dist = join(root, 'dist');

const BARE_IMPORT = /(?:from\s*|import\s*\(\s*|require\(\s*|^import\s+)["']([^"'./][^"']*)["']/gm;

/** The bare imports of every built file, from `dist` after `pnpm build`. */
function builtImports(): Set<string> {
  const names = new Set<string>();
  for (const file of readdirSync(dist)) {
    if (!/\.(c?js|d\.c?ts)$/.test(file)) continue;
    // JSDoc examples are not imports
    const code = readFileSync(join(dist, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const match of code.matchAll(BARE_IMPORT)) names.add(match[1]);
  }
  return names;
}

describe('throughTheSdk', () => {
  it('points Nova, Satellite, Pulsar and Orbit at the entries of the SDK', () => {
    expect(throughTheSdk(`import{a}from"@tuwaio/nova-connect/hooks";`)).toBe(
      `import{a}from"@tuwaio/sdk/nova-connect/hooks";`,
    );
    expect(throughTheSdk(`require('@tuwaio/satellite-react')`)).toBe(`require('@tuwaio/sdk/satellite/react')`);
    expect(throughTheSdk(`from "@tuwaio/orbit-solana"`)).toBe(`from "@tuwaio/solana-sdk/orbit"`);
  });

  it('points what is built in at the entries of this package', () => {
    expect(throughTheSdk(` * import { PaymentCheckout } from '@tuwaio/nova-payments';`)).toBe(
      ` * import { PaymentCheckout } from '@tuwaio/payments-sdk';`,
    );
    expect(throughTheSdk(`from '@tuwaio/quasar-sdk/checkout'`)).toBe(`from '@tuwaio/payments-sdk/checkout'`);
  });

  it('leaves what already goes through the SDK and other packages alone', () => {
    const source = `from'@tuwaio/sdk/orbit';from'@tuwaio/payments-sdk/evm';from'viem';`;
    expect(throughTheSdk(source)).toBe(source);
  });

  it('fails on a TUWA package without an entry, which would bring a second copy', () => {
    expect(() => throughTheSdk(`from '@tuwaio/nova-connect/satellite'`)).toThrow('@tuwaio/nova-connect/satellite');
  });

  it('every target is an entry of the SDK or of this package', () => {
    for (const target of Object.values(ENTRIES)) {
      expect(target).toMatch(/^@tuwaio\/(sdk|solana-sdk|payments-sdk)(\/|$)/);
    }
  });
});

describe('the built package', () => {
  it('imports TUWA only through the SDK and its own entries', () => {
    const tuwa = [...builtImports()].filter((name) => name.startsWith('@tuwaio/'));
    expect(tuwa.length).toBeGreaterThan(0);
    expect(tuwa.filter((name) => !/^@tuwaio\/(sdk|solana-sdk|payments-sdk)(\/|$)/.test(name))).toEqual([]);
  });

  it('declares every package it imports', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const declared = new Set([
      pkg.name,
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
    ]);
    const packageOf = (name: string) =>
      name
        .split('/')
        .slice(0, name.startsWith('@') ? 2 : 1)
        .join('/');
    expect([...builtImports()].map(packageOf).filter((name) => !declared.has(name))).toEqual([]);
  });

  it('ships the styles of the checkout', () => {
    expect(existsSync(join(dist, 'styles.css'))).toBe(true);
  });
});
