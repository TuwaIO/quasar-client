import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react', async () => ({
  ...(await vi.importActual<object>('react')),
  ...(await import('../testing/hookHarness')).hooks,
}));
vi.mock('../hooks/useCheckoutContext', () => ({
  useCheckoutContext: () => null,
  useOptionalCheckoutContext: () => null,
}));

// The icon set of the closest `NovaIconsProvider`: what a test puts in `iconSet`, else the default pixel set of Nova
const { iconSet } = vi.hoisted(() => ({ iconSet: { value: null as unknown } }));
vi.mock('@tuwaio/nova-core', async (importOriginal) => {
  const novaCore = await importOriginal<typeof import('@tuwaio/nova-core')>();
  return { ...novaCore, useNovaIcons: () => iconSet.value ?? novaCore.pixelIcons };
});

const { NovaSetIcon, pixelIcons } = await import('@tuwaio/nova-core');
const pixelOutline = await import('@tuwaio/nova-icons/24/outline');
const { render, unmount } = await import('../testing/hookHarness');
const fixture = await import('../testing/checkoutFixture');
const { capsLabel } = await import('./capsLabel');
const classes = await import('./classes');
const icons = await import('./icons');
const { CheckBox } = await import('./ScreenParts');

type Props = Record<string, unknown>;

const root = fileURLToPath(new URL('..', import.meta.url));
/** The sources of the package that draw something: its components and its styles, without the tests. */
const sources = readdirSync(root, { recursive: true })
  .map(String)
  .filter((file) => /\.(tsx?|css)$/.test(file) && !/\.test\.tsx?$/.test(file) && !file.startsWith('testing'))
  .map((file) => ({ file, code: readFileSync(`${root}/${file}`, 'utf8') }));
const manifest = JSON.parse(readFileSync(`${root}/../package.json`, 'utf8')) as Record<string, Record<string, string>>;

const words = (name: string) => name.split(' ');

// The look of Nova since 0.15, which the checkout shares: square, lines of 1 px, no shadow and no gradient, labels in
// spaced monospace capitals, the pixel icons. A part that leaves it stands out of the checkout and of the app around it.
describe('the checkout in paper and ink', () => {
  it('draws no icon of Heroicons and does not ask an app to install them', () => {
    // The scan below reads the sources: without them it would pass on nothing
    expect(sources.length).toBeGreaterThan(40);
    for (const { file, code } of sources) expect(code, file).not.toContain('@heroicons');
    for (const list of ['dependencies', 'peerDependencies', 'devDependencies'])
      expect(Object.keys(manifest[list] ?? {}), list).not.toContain('@heroicons/react');
    // The pixel icons come with the package, as with `@tuwaio/nova-core`
    expect(manifest.dependencies).toHaveProperty('@tuwaio/nova-icons');
  });

  it('takes the icons Nova draws too from the icon set of the app, so one set changes both', () => {
    const chevron = icons.ChevronDownIcon({ className: 'size' }) as ReactElement<Props>;
    expect(chevron.type).toBe(NovaSetIcon);
    expect(chevron.props).toEqual({ solid: 'ChevronDownIcon', className: 'size' });
    const wallet = icons.WalletOutlineIcon({}) as ReactElement<Props>;
    expect(wallet.type).toBe(NovaSetIcon);
    expect(wallet.props).toEqual({ outline: 'WalletIcon' });
  });

  // With the Heroicons set of Nova the checkout kept a pixel lock, QR code and download beside the thin icons of the
  // rest: the icons only the checkout draws did not look into the set
  describe('the icons only the checkout draws', () => {
    const OWN = [
      'ArrowDownTrayIcon',
      'ArrowPathRoundedSquareIcon',
      'ArrowUturnLeftIcon',
      'DevicePhoneMobileIcon',
      'FingerPrintIcon',
      'LockClosedIcon',
      'MagnifyingGlassIcon',
      'NoSymbolIcon',
      'QrCodeIcon',
    ] as const;
    const draw = (name: (typeof OWN)[number]) => icons[name]({ className: 'size' }) as ReactElement<Props>;

    it.each(OWN)('%s comes from the icon set of the app when the set has it', (name) => {
      const FromSet = () => null;
      iconSet.value = { ...pixelIcons, outline: { ...pixelIcons.outline, [name]: FromSet } };
      const icon = draw(name);
      iconSet.value = null;
      expect(icon.type).toBe(FromSet);
      expect(icon.props).toEqual({ className: 'size' });
    });

    // A set an app made before these names, the default set, and the sets of `@tuwaio/nova-core` 0.15.0 have none
    it.each(OWN)('%s is the pixel icon when the set has none', (name) => {
      iconSet.value = null;
      expect((pixelIcons.outline as Record<string, unknown>)[name]).toBeUndefined();
      const icon = draw(name);
      expect(icon.type).toBe(pixelOutline[name]);
      expect(icon.props).toEqual({ className: 'size' });
    });
  });

  it('has no round mark, no shadow, no gradient and no spinning ring in a class', () => {
    for (const { file, code } of sources.filter(({ file }) => /\.tsx?$/.test(file))) {
      // A mark that was a circle follows `--tuwa-rounded-full`, square unless the app rounds it again
      expect(code, file).not.toMatch(/novapay:rounded-full/);
      expect(code, file).not.toMatch(/novapay:(?:[a-z-]+:)*shadow/);
      expect(code, file).not.toMatch(/novapay:(?:[a-z-]+:)*bg-(?:gradient|linear|radial|conic)/);
      expect(code, file).not.toMatch(/novapay:animate-spin/);
    }
  });

  it('writes the two actions of a footer as the buttons of Nova: capitals with spacing, one size, square', () => {
    for (const action of [classes.primaryAction, classes.secondaryAction]) {
      expect(words(action)).toEqual(
        expect.arrayContaining([
          'novapay:font-mono',
          'novapay:uppercase',
          'novapay:tracking-[0.12em]',
          'novapay:text-xs',
          'novapay:rounded-[var(--tuwa-rounded-corners)]',
          'novapay:border',
        ]),
      );
      // A label that takes two lines (a long language, a long name, a phone) grows the button; a fixed height cut it
      expect(words(action)).toContain('novapay:min-h-11');
      expect(words(action)).not.toContain('novapay:h-11');
      expect(words(action)).toContain('novapay:leading-4');
    }
    // `tuwa-solid`: the icons of Nova inside a filled button keep the color of its label under the pointer
    expect(words(classes.primaryAction)).toContain('tuwa-solid');
    expect(words(classes.primaryAction)).toContain('novapay:bg-[var(--tuwa-button-primary-bg)]');
    expect(words(classes.secondaryAction)).toContain('novapay:border-[var(--tuwa-border-strong)]');
    expect(words(classes.secondaryAction)).toContain('novapay:bg-[var(--tuwa-standart-button-bg)]');
  });

  it('writes labels and chips in small spaced capitals, a chip in a frame of 1 px', () => {
    for (const name of [classes.label, classes.chip])
      expect(words(name)).toEqual(
        expect.arrayContaining([
          'novapay:font-mono',
          'novapay:font-bold',
          'novapay:uppercase',
          'novapay:tracking-[0.12em]',
        ]),
      );
    expect(words(classes.chip)).toContain('novapay:border');
    // The accent reads on the surface in both themes and not on a tint of itself: the accent chip has no fill
    expect(classes.chipTone.accent).not.toMatch(/novapay:bg-/);
    for (const tone of Object.values(classes.chipTone)) expect(tone).toMatch(/novapay:border-\[/);
  });

  it('keeps what a label in capitals is filled with in its own letters: a name is never changed', () => {
    const parts = capsLabel('Back to {merchant}', { merchant: 'eBay' }) as unknown[];
    expect(fixture.text(parts)).toBe('Back to eBay');
    const [words, name] = parts as [string, ReactElement<Props>];
    expect(words).toBe('Back to ');
    expect(name.props).toEqual({ className: 'novapay:normal-case', children: 'eBay' });
  });

  it('fills a label that names the same thing twice, each time in an element of its own', () => {
    const parts = capsLabel('{wallet} asks: open {wallet}, {count} left', {
      wallet: 'MetaMask',
      count: 2,
    }) as unknown[];
    expect(fixture.text(parts)).toBe('MetaMask asks: open MetaMask, 2 left');
    const keys = parts.filter((part) => typeof part !== 'string').map((part) => (part as ReactElement).key);
    expect(new Set(keys).size).toBe(3);
  });

  it('draws a checkbox as a square over a real one, which keeps its label, its form and the keyboard', () => {
    const onChange = () => undefined;
    const parts = fixture.elements(render(CheckBox, { checked: true, required: true, onChange }));
    unmount();
    const input = parts.find((part) => part.type === 'input')!;
    expect(input.props).toMatchObject({ type: 'checkbox', checked: true, required: true, onChange });
    const box = words(String(input.props.className));
    expect(box).toEqual(
      expect.arrayContaining([
        'novapay:appearance-none',
        'novapay:rounded-[var(--tuwa-rounded-full)]',
        // 3:1 apart from the surface (WCAG 1.4.11): the line of a card is too faint for the frame of a control
        'novapay:border-[var(--tuwa-text-secondary)]',
        'novapay:checked:bg-[var(--tuwa-text-accent)]',
      ]),
    );
    // The check lies over the box and must not take the click meant for it
    const check = parts.find((part) =>
      String(part.props.className ?? '').includes('novapay:peer-checked:opacity-100'),
    )!;
    expect(words(String(check.props.className))).toContain('novapay:pointer-events-none');
  });
});
