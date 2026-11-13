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

const { MorphText, NovaSetIcon, pixelIcons } = await import('@tuwaio/nova-core');
const pixelOutline = await import('@tuwaio/nova-icons/24/outline');
const { render, unmount } = await import('../testing/hookHarness');
const fixture = await import('../testing/checkoutFixture');
const { CapsLabel } = await import('./CapsLabel');
const classes = await import('./classes');
const icons = await import('./icons');
const { CheckBox, PrimaryButton } = await import('./ScreenParts');

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

  describe('a label in capitals', () => {
    type Place = ReactElement<{ children: [string, ReactElement<Props>, string] }>;
    /** The label as drawn: its element, and inside it the element of each place (between the spaces around it). */
    const draw = (label: string, values?: Record<string, string | number>) => {
      const element = render(CapsLabel, { label, values }) as ReactElement<{ className: string; children: Place[] }>;
      const slots = element.props.children;
      return { element, slots, places: slots.map((slot) => ({ ...slot.props.children[1], key: slot.key })) };
    };
    const texts = (places: { props: Props }[]) => places.map((place) => place.props.children);

    it('keeps what it is filled with in its own letters: a name is never changed', () => {
      const { places } = draw('Back to {merchant}', { merchant: 'eBay' });
      unmount();
      expect(texts(places)).toEqual(['Back to', 'eBay', '']);
      // The words take the capitals of the button around them; the name does not
      expect(places[0].props.className).toBeUndefined();
      expect(places[1].props.className).toBe('novapay:normal-case');
    });

    // Filled in as loose parts, a label lost the morph of a text that changes ("Confirm in …" to "Waiting for …"): only a
    // plain text morphed, and a label with a name in it was replaced at once
    it('morphs place by place when it changes: the words into the new words, a name that stays keeps still', () => {
      const before = draw('Confirm in {wallet}', { wallet: 'MetaMask' }).places;
      const after = draw('Waiting for {wallet}…', { wallet: 'MetaMask' }).places;
      unmount();
      for (const place of [...before, ...after]) expect(place.type).toBe(MorphText);
      // The same place in both labels is the same element for React, so its text morphs instead of being replaced
      expect(before.map((place) => place.key)).toEqual(['0', '1', '2']);
      expect(after.map((place) => place.key)).toEqual(['0', '1', '2']);
      expect(texts(before)).toEqual(['Confirm in', 'MetaMask', '']);
      expect(texts(after)).toEqual(['Waiting for', 'MetaMask', '…']);
      expect(after[1].props).toEqual(before[1].props);
    });

    // A name that left with its label vanished at once and the words jumped sideways to the middle: its place stays,
    // empty, so the name morphs out and the next one morphs in
    it('keeps the place of a name when a plain label follows, and a plain label is the same element', () => {
      const filled = draw('Turn off in {wallet}', { wallet: 'MetaMask' }).places;
      const plain = draw('Waiting for the network…').places;
      unmount();
      expect(texts(filled)).toEqual(['Turn off in', 'MetaMask', '']);
      expect(texts(plain)).toEqual(['Waiting for the network…', '', '']);
      expect(plain.map((place) => place.key)).toEqual(filled.map((place) => place.key));
      expect(plain[1].props.className).toBeUndefined();
      // The main button draws its plain labels with the same element, so a plain label morphs into a filled-in one
      const button = render(PrimaryButton, { children: 'Check again' }) as ReactElement<{ children: unknown[] }>;
      unmount();
      const label = fixture.ofType(button, CapsLabel)[0];
      expect(label.props).toEqual({ label: 'Check again' });
    });

    // The name of a button is put together from the texts of its elements, and a tool that computes it dropped the space
    // at the end of an element: "Confirm inMetaMask". The spaces between two places are text between their elements
    it('keeps the spaces between its places as plain text, outside the elements of the places', () => {
      const { slots } = draw('Let {merchant} pay the gas', { merchant: 'Acme Labs' });
      unmount();
      const drawn = slots.map((slot) => slot.props.children.map((part) => (typeof part === 'string' ? part : '·')));
      expect(drawn).toEqual([
        ['', '·', ' '],
        ['', '·', ''],
        [' ', '·', ''],
      ]);
      for (const slot of slots) expect(String(slot.props.children[1].props.children)).not.toMatch(/^\s|\s$/);
    });

    // As loose parts in a button that lays its content out in a row, each part was an item of the row: the gap of the
    // row stood for the space between the words and the name
    it('is one element, so a button has one item for it', () => {
      const { element } = draw('Let {merchant} pay the gas', { merchant: 'Acme Labs' });
      unmount();
      expect(element.type).toBe('span');
      expect(words(element.props.className)).toContain('novapay:min-w-0');
      expect(fixture.text(element)).toBe('Let Acme Labs pay the gas');
    });

    it('reads as the label with its values in place, also where a name comes twice', () => {
      const { element, places } = draw('{wallet} asks: open {wallet}, {count} left', { wallet: 'MetaMask', count: 2 });
      unmount();
      expect(fixture.text(element)).toBe('MetaMask asks: open MetaMask, 2 left');
      // More places than the three that are always there: every part has one
      expect(texts(places)).toEqual(['MetaMask', 'asks: open', 'MetaMask', ',', '2', 'left']);
      expect(new Set(places.map((place) => place.key)).size).toBe(places.length);
      // A test reads the label of a button the same way, from the element a screen passes as its label
      expect(fixture.text(<CapsLabel label="Back to {merchant}" values={{ merchant: 'Acme Labs' }} />)).toBe(
        'Back to Acme Labs',
      );
      expect(fixture.text(<CapsLabel label="Check again" />)).toBe('Check again');
    });
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
