import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
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

describe('the release', () => {
  // The package bundles the other two, and release-please splits commits by path: without this, a fix to the checkout
  // would not release the module that contains it
  it('releases the module whenever a package it bundles is released', () => {
    const config = JSON.parse(readFileSync(join(root, '../../release-please-config.json'), 'utf8'));
    expect(config.plugins).toContain('node-workspace');
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    expect(pkg.devDependencies['@tuwaio/nova-payments']).toMatch(/^workspace:/);
    expect(pkg.devDependencies['@tuwaio/quasar-sdk']).toMatch(/^workspace:/);
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

describe('the types of the built package', () => {
  const RELATIVE = /(?:from\s*|^import\s+)["'](\.\/[^"']+)["']/gm;

  it('only refer to files that are in dist', () => {
    const missing: string[] = [];
    for (const file of readdirSync(dist)) {
      if (!/\.d\.c?ts$/.test(file)) continue;
      const code = readFileSync(join(dist, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const [, target] of code.matchAll(RELATIVE)) {
        const base = target.replace(/\.c?js$/, '');
        if (!existsSync(join(dist, `${base}.d.ts`)) && !existsSync(join(dist, `${base}.d.cts`))) {
          missing.push(`${file} -> ${target}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  // Apps with `skipLibCheck` see no error in a broken .d.ts: its types silently become `any`
  it('compile without skipLibCheck and are not `any`', () => {
    const entries = readdirSync(dist)
      .filter((file) => /\.d\.ts$/.test(file))
      .map((file) => join(dist, file));
    const program = ts.createProgram([...entries, join(root, 'src/__tests__/fixtures/namedTypes.ts')], {
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
      strict: true,
      noEmit: true,
      skipLibCheck: false,
      types: [],
    });
    const ours = ts
      .getPreEmitDiagnostics(program)
      .filter(({ file }) => file?.fileName.startsWith(root) && !file.fileName.includes('node_modules'))
      .map(
        ({ file, messageText }) =>
          `${relative(root, file!.fileName)}: ${ts.flattenDiagnosticMessageText(messageText, ' ')}`,
      );
    expect(ours).toEqual([]);
  }, 120_000);
});
