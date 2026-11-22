import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** The dependencies and dev dependencies of a workspace folder, by name. */
const dependenciesOf = (folder: string): Record<string, string> => {
  const json = JSON.parse(readFileSync(path.join(root, folder, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  return { ...json.dependencies, ...json.devDependencies };
};

// Two versions of a Nova package split its React contexts. The docs kept Nova Transactions 0.16 beside the alpha the
// checkout is tested with: the checkout gave its labels to one copy and its steps read the other, so the steps said
// "Succeed" instead of "Paid", and "Pending To Paid" failed whenever Vite took the two entries from different copies
describe('the packages the stories render with', () => {
  it('are the versions the checkout packages are tested with', () => {
    const docs = dependenciesOf('apps/docs');
    for (const folder of ['packages/nova-payments', 'packages/payments-sdk']) {
      for (const [name, version] of Object.entries(dependenciesOf(folder))) {
        if (!name.startsWith('@tuwaio/') || version.startsWith('workspace:') || !(name in docs)) continue;
        expect({ folder, name, version: docs[name] }).toEqual({ folder, name, version });
      }
    }
  });
});
