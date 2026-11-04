import { expect, it, vi } from 'vitest';

// Whether something loaded the root of `@tuwaio/nova-connect`, which carries its modals and their libraries
const loaded = vi.hoisted(() => ({ novaConnectRoot: false }));
vi.mock('@tuwaio/nova-connect', () => {
  loaded.novaConnectRoot = true;
  return { NovaConnectProvider: () => null };
});

it("does not load Nova Connect's modals with the package: only Nova's own connection does, when it is used", async () => {
  await import('./index');
  expect(loaded.novaConnectRoot).toBe(false);

  const { loadOwnConnection } = await import('./providers/ownConnectionLoader');
  await loadOwnConnection();
  expect(loaded.novaConnectRoot).toBe(true);
});
