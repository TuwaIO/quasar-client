import { defineConfig } from 'tsup';

import pkg from './package.json';

// Nova Payments and the checkout client are built in. Everything else of TUWA they import stays an import, which
// scripts/through-the-sdk.mjs points at @tuwaio/sdk after the build, so an app has one copy of Nova
const BUILT_IN = [/^@tuwaio\/nova-payments/, /^@tuwaio\/quasar-sdk/];

export default defineConfig([
  {
    format: ['cjs', 'esm'],
    entry: ['./src/index.ts', './src/i18n.ts', './src/evm.ts', './src/solana.ts', './src/checkout.ts'],
    treeshake: true,
    sourcemap: false,
    minify: true,
    clean: true,
    dts: {
      resolve: BUILT_IN,
      // The dts bundler reads only the `types` field of a package, not its `exports`: the entries have to be named
      compilerOptions: {
        paths: {
          '@tuwaio/nova-payments/i18n': ['../nova-payments/dist/i18n/index.d.ts'],
          '@tuwaio/nova-payments/evm': ['../nova-payments/dist/evm/index.d.ts'],
          '@tuwaio/nova-payments/solana': ['../nova-payments/dist/solana/index.d.ts'],
          '@tuwaio/quasar-sdk/checkout': ['../quasar-sdk/dist/checkout.d.ts'],
        },
      },
    },
    splitting: true,
    noExternal: BUILT_IN,
    outExtension({ format }) {
      return {
        js: `.${format === 'esm' ? 'js' : 'cjs'}`,
      };
    },
    external: [
      /^@tuwaio\/(?!nova-payments|quasar-sdk)/,
      ...Object.keys(pkg.peerDependencies || {}),
      ...Object.keys(pkg.dependencies || {}),
    ],
  },
]);
