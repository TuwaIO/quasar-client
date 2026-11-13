import React from 'react';
import { createPortal } from 'react-dom';
import { addons, types } from 'storybook/manager-api';
import { create, useTheme } from 'storybook/theming';

import { LOCALE_OPTIONS, storybookLabels } from '../i18n/labels';
import {
  DEFAULT_LOCALE,
  getInitialLocale,
  LOCALE_URL_PARAM,
  normalizeLocale,
  REQUEST_LOCALE_EVENT,
  SET_LOCALE_EVENT,
  storeLocale,
} from '../i18n/locale';

// ─── Shared Constants ────────────────────────────────────────────────────────

const STORAGE_KEY = 'tuwa-storybook-theme';
const CHANNEL_EVENT = 'tuwa/set-theme';

// ─── ThemeSwitcher (the switch of @tuwaio/docs-ui 0.10; its styles are in manager-head.html) ────────────────

const cls = (...names) => names.filter(Boolean).join(' ');

// The pixels of a 7 × 7 grid: a crescent moon with two stars that twinkle, and a sun with a round disc and eight rays
// prettier-ignore
const MOON = [
  [2, 0], [3, 0], [4, 0], [1, 1], [2, 1], [3, 1], [0, 2], [1, 2], [2, 2], [0, 3], [1, 3], [2, 3],
  [0, 4], [1, 4], [2, 4], [1, 5], [2, 5], [3, 5], [2, 6], [3, 6], [4, 6], [6, 0, 'twinkle'], [5, 3, 'twinkle'],
];
// prettier-ignore
const SUN = [
  [2, 2, 'tl'], [3, 2], [4, 2, 'tr'], [2, 3], [3, 3], [4, 3], [2, 4, 'bl'], [3, 4], [4, 4, 'br'],
  [3, 0], [5, 1], [6, 3], [5, 5], [3, 6], [1, 5], [0, 3], [1, 1],
];
// In the order of their angle around the centre, so each pixel travels a short way to the other picture
const byAngle = (pixels) =>
  [...pixels].sort(([ax, ay], [bx, by]) => Math.atan2(ay - 3, ax - 3) - Math.atan2(by - 3, bx - 3));
const MOON_PATH = byAngle(MOON);
const SUN_PATH = byAngle(SUN);
const PIXEL_COUNT = Math.max(MOON_PATH.length, SUN_PATH.length);

const ThemeSwitcher = ({ isDark, onToggle, ariaLabel }) => {
  // The first render places the knob without moving it; the moves of later toggles play
  const [moved, setMoved] = React.useState(false);
  const pixels = isDark ? MOON_PATH : SUN_PATH;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={ariaLabel}
      onClick={() => {
        setMoved(true);
        onToggle();
      }}
      className={cls(
        'tuwa-theme-switch tuwa-switch-appear',
        isDark ? 'tuwa-theme-switch--dark' : 'tuwa-theme-switch--light',
      )}
    >
      <span
        aria-hidden="true"
        className={cls(
          'tuwa-theme-switch__knob',
          moved && (isDark ? 'tuwa-theme-switch__knob--to-dark' : 'tuwa-theme-switch__knob--to-light'),
        )}
      >
        <span className="tuwa-theme-switch__glow tuwa-theme-switch__glow--top" />
        <span className="tuwa-theme-switch__glow tuwa-theme-switch__glow--bottom" />
        <span className="tuwa-theme-switch__pixels">
          {Array.from({ length: PIXEL_COUNT }, (_, index) => {
            const pixel = pixels[index];
            const mark = pixel?.[2];
            return (
              <span
                key={index}
                className={cls(
                  'tuwa-theme-switch__pixel',
                  mark === 'twinkle' && 'tuwa-theme-switch__pixel--twinkle',
                  mark && mark !== 'twinkle' && `tuwa-theme-switch__pixel--${mark}`,
                )}
                style={{
                  '--x': pixel ? pixel[0] : 3,
                  '--y': pixel ? pixel[1] : 3,
                  '--delay': `${index * 14}ms`,
                  '--twinkle-delay': `${(index % 4) * 600}ms`,
                  opacity: pixel ? 1 : 0,
                }}
              />
            );
          })}
        </span>
        {/* A satellite around the moon, a planet around the sun, on a tilted orbit, for a moment after a change */}
        <span className="tuwa-theme-switch__orbit">
          <span className="tuwa-theme-switch__orbiter" />
        </span>
      </span>
    </button>
  );
};

// ─── Language (the active language of the manager) ───────────────────────────
// One value for the whole manager: the language tool sets it, the theme tool reads its texts, and the preview iframe
// receives it over the channel (`tuwa/set-locale`, see ../i18n/locale.ts). Session Storage is written only when the
// visitor picks a language (Cookie Policy); until then the language of the browser is used.

let managerLocale = getInitialLocale();
const localeListeners = new Set();

function subscribeLocale(listener) {
  localeListeners.add(listener);
  return () => localeListeners.delete(listener);
}

function getManagerLocale() {
  return managerLocale;
}

function setManagerLocale(next) {
  const locale = normalizeLocale(next);
  if (!locale || locale === managerLocale) return;
  managerLocale = locale;
  storeLocale(locale);
  localeListeners.forEach((listener) => listener());
}

const useManagerLocale = () => React.useSyncExternalStore(subscribeLocale, getManagerLocale, getManagerLocale);

// ─── LanguageSwitcher (the switch of @tuwaio/docs-ui 0.10; its styles are in manager-head.html) ──────────────

const TRIGGER_W = 76;
const TRIGGER_H = 32;
const RADIUS = 0;
const OPTION_H = 40;
const MENU_W = 200;

// The glow of each language: the colour of its flag
const GLOWS = { en: '#3b82f6', uk: '#facc15', 'zh-CN': '#ef4444' };

const FlagUK = () => (
  <svg viewBox="0 0 640 480" width={16} height={12} aria-hidden="true" className="tuwa-locale-flag">
    <path fill="#012169" d="M0 0h640v480H0z" />
    <path fill="#FFF" d="m75 0 245 180L565 0h75v60L435 240l205 180v60h-75L320 300 75 480H0v-60l205-180L0 60V0h75z" />
    <path
      fill="#C8102E"
      d="m425 285 215 165v30h-35L380 300l45-15zM215 195 0 30v-30h35l225 180-45 15zm0 90L0 450v30h35l225-180-45-15zm210-90L640 30v-30h-35L380 180l45 15z"
    />
    <path fill="#FFF" d="M250 0h140v480H250zM0 170h640v140H0z" />
    <path fill="#C8102E" d="M276 0h88v480h-88zM0 196h640v88H0z" />
  </svg>
);

const FlagUkraine = () => (
  <svg viewBox="0 0 640 480" width={16} height={12} aria-hidden="true" className="tuwa-locale-flag">
    <path fill="#0057b7" d="M0 0h640v240H0z" />
    <path fill="#ffd700" d="M0 240h640v240H0z" />
  </svg>
);

const FlagChina = () => (
  <svg viewBox="0 0 640 480" width={16} height={12} aria-hidden="true" className="tuwa-locale-flag">
    <rect width="640" height="480" fill="#ee1c25" />
    <path fill="#ffde00" d="M120 72l14.1 43.4H180l-36.9 26.8 14.1 43.4-37.2-26.8-37.2 26.8 14.1-43.4L60 115.4h45.9z" />
    <circle cx="200" cy="40" r="12" fill="#ffde00" />
    <circle cx="240" cy="80" r="12" fill="#ffde00" />
    <circle cx="240" cy="140" r="12" fill="#ffde00" />
    <circle cx="200" cy="180" r="12" fill="#ffde00" />
  </svg>
);

const FLAGS = { en: FlagUK, uk: FlagUkraine, 'zh-CN': FlagChina };

const Flag = ({ code }) => {
  const Icon = FLAGS[code];
  return Icon ? <Icon /> : null;
};

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

// Down and up chevrons that slide and fade, like ChevronArrowWithAnim of Nova UI Kit
const Chevron = ({ isOpen, color }) => {
  const transition = prefersReducedMotion() ? 'none' : 'opacity 0.4s ease-out, transform 0.4s ease-out';
  const base = { position: 'absolute', inset: 0, width: 14, height: 14, transition };
  return (
    <span
      aria-hidden="true"
      style={{ position: 'relative', display: 'inline-flex', width: 14, height: 14, flexShrink: 0, color }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth={2}
        stroke="currentColor"
        style={{ ...base, opacity: isOpen ? 0 : 1, transform: isOpen ? 'translateY(-3px) scaleY(0.8)' : 'none' }}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
      </svg>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth={2}
        stroke="currentColor"
        style={{ ...base, opacity: isOpen ? 1 : 0, transform: isOpen ? 'none' : 'translateY(3px) scaleY(0.8)' }}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
      </svg>
    </span>
  );
};

// The Latin letter of a key whatever the keyboard layout (`KeyE` on a Cyrillic layout is still "e")
function latinKey(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (/^[a-zA-Z]$/.test(event.key)) return event.key.toLowerCase();
  if (event.code?.startsWith('Key')) return event.code.slice(3).toLowerCase();
  return null;
}

function matchesKey(option, char) {
  if (option.code.toLowerCase().startsWith(char) || option.short.toLowerCase().startsWith(char)) return true;
  if (option.code === 'zh-CN' && char === 'c') return true;
  return option.code === 'uk' && char === 'u';
}

const LanguageSwitcher = ({ locale, onSelect, ariaLabel }) => {
  const theme = useTheme();
  const isDark = theme?.base === 'dark';
  const accent = theme?.barSelectedColor ?? (isDark ? '#3ed2ec' : '#b93b0a');
  const textColor = theme?.color?.defaultText ?? (isDark ? '#f2f1ee' : '#101014');
  const mutedColor = theme?.barTextColor ?? (isDark ? '#9d9c9a' : '#636366');
  const menuBg = theme?.background?.content ?? (isDark ? '#121316' : '#faf9f7');
  const borderColor = theme?.appBorderColor ?? (isDark ? '#2b2c30' : '#d6d5d1');

  const [isOpen, setIsOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [hovered, setHovered] = React.useState(false);
  const [menuPosition, setMenuPosition] = React.useState({ top: 0, left: 0 });
  const [isTouch, setIsTouch] = React.useState(false);
  const buttonRef = React.useRef(null);
  const listRef = React.useRef(null);
  const listboxId = React.useId();
  // How many times the language changed: each change springs the knob and brings the new flag in (none at first)
  const [shown, setShown] = React.useState(locale);
  const [changes, setChanges] = React.useState(0);
  if (shown !== locale) {
    setShown(locale);
    setChanges(changes + 1);
  }

  // On touch screens an invisible native <select> over the button opens the picker of the system
  React.useEffect(() => {
    if (!window.matchMedia) return;
    const coarse = window.matchMedia('(pointer: coarse)');
    const update = () => setIsTouch(coarse.matches && !window.matchMedia('(pointer: fine)').matches);
    update();
    coarse.addEventListener?.('change', update);
    return () => coarse.removeEventListener?.('change', update);
  }, []);

  const openMenu = (index) => {
    const rect = buttonRef.current?.getBoundingClientRect();
    // Below the button, from its left edge (the tools sit on the left of the toolbar), kept inside the window
    if (rect) {
      setMenuPosition({ top: rect.bottom + 6, left: Math.max(8, Math.min(rect.left, window.innerWidth - MENU_W - 8)) });
    }
    const current = LOCALE_OPTIONS.findIndex((option) => option.code === locale);
    setActiveIndex(index ?? (current >= 0 ? current : 0));
    setIsOpen(true);
  };

  const closeMenu = () => {
    setIsOpen(false);
    buttonRef.current?.focus();
  };

  const pick = (code) => {
    closeMenu();
    if (code !== locale) onSelect(code);
  };

  React.useEffect(() => {
    if (!isOpen) return;
    listRef.current?.focus();
    const onPointerDown = (event) => {
      if (buttonRef.current?.contains(event.target) || listRef.current?.contains(event.target)) return;
      setIsOpen(false);
    };
    const onResize = () => setIsOpen(false);
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', onResize);
    };
  }, [isOpen]);

  const handleKeyDown = (event) => {
    const last = LOCALE_OPTIONS.length - 1;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (isOpen) setActiveIndex((index) => (index < last ? index + 1 : 0));
        else openMenu();
        return;
      case 'ArrowUp':
        event.preventDefault();
        if (isOpen) setActiveIndex((index) => (index > 0 ? index - 1 : last));
        else openMenu();
        return;
      case 'Home':
      case 'End':
        if (!isOpen) return;
        event.preventDefault();
        setActiveIndex(event.key === 'Home' ? 0 : last);
        return;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (isOpen) pick(LOCALE_OPTIONS[activeIndex].code);
        else openMenu();
        return;
      case 'Escape':
        if (!isOpen) return;
        event.preventDefault();
        event.stopPropagation();
        closeMenu();
        return;
      case 'Tab':
        if (isOpen) setIsOpen(false);
        return;
      default: {
        const char = latinKey(event);
        if (!char) return;
        const after = LOCALE_OPTIONS.findIndex((option, index) => index > activeIndex && matchesKey(option, char));
        const target = after >= 0 ? after : LOCALE_OPTIONS.findIndex((option) => matchesKey(option, char));
        if (target < 0) return;
        event.preventDefault();
        if (isOpen) setActiveIndex(target);
        else openMenu(target);
      }
    }
  };

  const active = LOCALE_OPTIONS.find((option) => option.code === locale) ?? LOCALE_OPTIONS[0];
  const optionId = (code) => `${listboxId}-option-${code}`;

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      {isTouch && (
        <select
          value={locale}
          onChange={(event) => onSelect(event.target.value)}
          aria-label={ariaLabel}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            width: '100%',
            height: '100%',
            opacity: 0,
            cursor: 'pointer',
          }}
        >
          {LOCALE_OPTIONS.map((option) => (
            <option key={option.code} value={option.code} lang={option.code}>
              {option.label} ({option.short})
            </option>
          ))}
        </select>
      )}
      <button
        ref={buttonRef}
        type="button"
        tabIndex={isTouch ? -1 : 0}
        aria-hidden={isTouch ? true : undefined}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        onClick={() => (isOpen ? closeMenu() : openMenu())}
        onKeyDown={handleKeyDown}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="tuwa-locale-switch tuwa-switch-appear"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: TRIGGER_W,
          height: TRIGGER_H,
          padding: '0 8px 0 2px',
          borderRadius: RADIUS,
          // Paper and ink: a frame of 1 px, no fill until the pointer is over it
          border: `1px solid ${borderColor}`,
          background: hovered ? (isDark ? 'rgba(242,241,238,0.06)' : 'rgba(16,16,20,0.04)') : 'transparent',
          color: textColor,
          cursor: 'pointer',
          transition: 'background 0.3s ease, border-color 0.3s ease',
          flexShrink: 0,
        }}
      >
        {/* The flag on a knob as the theme switch's, with a line in its colour; a small spring when it changes */}
        <span
          aria-hidden="true"
          className={cls(
            'tuwa-locale-switch__knob',
            changes > 0 && (changes % 2 ? 'tuwa-locale-switch__knob--bump-a' : 'tuwa-locale-switch__knob--bump-b'),
          )}
          style={{ '--glow': GLOWS[active.code] ?? accent }}
        >
          <span className="tuwa-locale-switch__glow" />
          <span
            key={active.code}
            className={cls('tuwa-locale-switch__flag', changes > 0 && 'tuwa-locale-switch__flag--in')}
          >
            <Flag code={active.code} />
          </span>
        </span>
        {/* The visible label starts the accessible name (WCAG 2.5.3) */}
        <span
          style={{
            width: 22,
            textAlign: 'center',
            fontFamily: theme?.typography?.fonts?.mono,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          {active.short}
        </span>
        <span
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            overflow: 'hidden',
            clip: 'rect(0 0 0 0)',
            whiteSpace: 'nowrap',
          }}
        >
          , {active.label} — {ariaLabel}
        </span>
        <Chevron isOpen={isOpen} color={hovered ? textColor : mutedColor} />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={listRef}
            id={listboxId}
            role="listbox"
            tabIndex={-1}
            aria-label={ariaLabel}
            aria-activedescendant={optionId(LOCALE_OPTIONS[activeIndex].code)}
            onKeyDown={handleKeyDown}
            style={{
              position: 'fixed',
              top: menuPosition.top,
              left: menuPosition.left,
              zIndex: 100000,
              width: MENU_W,
              overflow: 'hidden',
              borderRadius: RADIUS,
              border: `1px solid ${borderColor}`,
              background: menuBg,
              outline: 'none',
              fontFamily: theme?.typography?.fonts?.base,
            }}
          >
            {LOCALE_OPTIONS.map((option, index) => {
              const selected = option.code === locale;
              const focused = index === activeIndex;
              return (
                <div
                  key={option.code}
                  id={optionId(option.code)}
                  role="option"
                  lang={option.code}
                  aria-selected={selected}
                  onClick={() => pick(option.code)}
                  onPointerMove={() => focused || setActiveIndex(index)}
                  // Each language in the colours of its flag, as the knob of the switch
                  className={cls('tuwa-locale-switch__option', focused && 'tuwa-locale-switch__option--active')}
                  style={{
                    '--glow': GLOWS[option.code] ?? accent,
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    height: OPTION_H,
                    padding: '0 12px',
                    fontSize: 12,
                    fontWeight: selected ? 700 : 400,
                    cursor: 'pointer',
                    color: selected || focused ? textColor : mutedColor,
                    background: selected
                      ? `color-mix(in srgb, var(--glow) ${focused ? 14 : 10}%, transparent)`
                      : focused
                        ? isDark
                          ? 'rgba(255,255,255,0.06)'
                          : 'rgba(0,0,0,0.04)'
                        : 'transparent',
                    transition: 'background 0.15s ease, color 0.15s ease',
                  }}
                >
                  {selected && (
                    <span
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: 3,
                        background: 'var(--glow-line)',
                      }}
                    />
                  )}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span aria-hidden="true" className="tuwa-locale-switch__tile">
                      <span className="tuwa-locale-switch__glow" />
                      <Flag code={option.code} />
                    </span>
                    {option.label}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      style={{
                        padding: '2px 6px',
                        borderRadius: 0,
                        fontFamily: theme?.typography?.fonts?.mono,
                        fontSize: 10,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        color: selected ? textColor : mutedColor,
                        background: selected ? 'color-mix(in srgb, var(--glow) 15%, transparent)' : 'transparent',
                        boxShadow: selected
                          ? 'inset 0 0 0 1px color-mix(in srgb, var(--glow-line) 40%, transparent)'
                          : 'none',
                      }}
                    >
                      {option.short}
                    </span>
                    {selected && (
                      <span
                        aria-hidden="true"
                        style={{
                          width: 6,
                          height: 6,
                          background: 'var(--glow-line)',
                        }}
                      />
                    )}
                  </span>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
};

const LanguageTool = () => {
  const locale = useManagerLocale();
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: '100%', padding: '0 0 0 8px' }}>
      <LanguageSwitcher
        locale={locale}
        onSelect={setManagerLocale}
        ariaLabel={storybookLabels[locale].selectLanguage}
      />
    </div>
  );
};

// ─── Storybook Themes ────────────────────────────────────────────────────────

const LOGO_LIGHT = 'https://tuwa.io/brand/logo_v2.svg';
const LOGO_DARK = 'https://tuwa.io/brand/logo_glow.svg';

export const tuwaTheme = create({
  base: 'light',
  brandTitle: 'TUWA Payments',
  brandUrl: 'https://www.tuwa.io/',
  brandImage: LOGO_LIGHT,
  brandTarget: '_self',
  // The deep shade of the TUWA orange: white text on the chosen item is 5.7:1
  colorPrimary: '#b93b0a',
  colorSecondary: '#b93b0a',
  appBg: '#f2f1ee',
  appContentBg: '#faf9f7',
  appPreviewBg: '#faf9f7',
  appBorderColor: '#d6d5d1',
  appBorderRadius: 0,
  fontBase: '"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  fontCode: '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  textColor: '#101014',
  textInverseColor: '#faf9f7',
  textMutedColor: '#636366',
  barTextColor: '#636366',
  barSelectedColor: '#b93b0a',
  barHoverColor: '#f05a14',
  barBg: '#f2f1ee',
  inputBg: '#faf9f7',
  inputBorder: '#bdbcb9',
  inputTextColor: '#101014',
  inputBorderRadius: 0,
});

export const tuwaDarkTheme = create({
  base: 'dark',
  brandTitle: 'TUWA Payments',
  brandUrl: 'https://www.tuwa.io/',
  brandImage: LOGO_DARK,
  brandTarget: '_self',
  // The cyan of the dark logo; the chosen item takes a deep cyan under white text, 5.4:1 (Storybook darkens it 18% more)
  colorPrimary: '#3ed2ec',
  colorSecondary: '#0e7490',
  appBg: '#101014',
  appContentBg: '#121316',
  appPreviewBg: '#121316',
  appBorderColor: '#2b2c30',
  appBorderRadius: 0,
  fontBase: '"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  fontCode: '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  textColor: '#f2f1ee',
  textInverseColor: '#101014',
  textMutedColor: '#9d9c9a',
  barTextColor: '#9d9c9a',
  barSelectedColor: '#3ed2ec',
  barHoverColor: '#8ef5ff',
  barBg: '#101014',
  inputBg: '#17181b',
  inputBorder: '#3a3b3f',
  inputTextColor: '#f2f1ee',
  inputBorderRadius: 0,
});

let currentLogoIsDark = false;

function syncBrandLogo(isDark) {
  currentLogoIsDark = isDark;
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-tuwa-theme', isDark ? 'dark' : 'light');
  const targetSrc = isDark ? LOGO_DARK : LOGO_LIGHT;
  const imgs = document.querySelectorAll('.sidebar-header img, a[title*="TUWA"] img');
  imgs.forEach((img) => {
    if (img instanceof HTMLImageElement && img.src !== targetSrc) {
      img.src = targetSrc;
    }
  });
}

if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
  const observer = new MutationObserver(() => {
    const targetSrc = currentLogoIsDark ? LOGO_DARK : LOGO_LIGHT;
    const imgs = document.querySelectorAll('.sidebar-header img, a[title*="TUWA"] img');
    imgs.forEach((img) => {
      if (img instanceof HTMLImageElement && img.src !== targetSrc) {
        img.src = targetSrc;
      }
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

// ─── Resolve initial theme (sessionStorage > system preference) ──────────────

function getInitialDark() {
  if (typeof window === 'undefined') return false;
  const stored = sessionStorage.getItem(STORAGE_KEY);
  if (stored === 'dark') return true;
  if (stored === 'light') return false;
  // No stored preference — follow system
  return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? false;
}

const initialIsDark = getInitialDark();

// Nothing is written to sessionStorage until the user switches the theme (Cookie Policy):
// without a stored value, the preview iframe resolves the same system preference on its own mount
if (typeof window !== 'undefined') {
  syncBrandLogo(initialIsDark);
}

// ─── Set initial manager theme (runs once on module load) ────────────────────

addons.setConfig({
  theme: initialIsDark ? tuwaDarkTheme : tuwaTheme,
});

// ─── Unified Theme Toggle ────────────────────────────────────────────────────

const UnifiedThemeTool = ({ api }) => {
  const [isDark, setIsDark] = React.useState(getInitialDark);
  const labels = storybookLabels[useManagerLocale()];

  // Broadcast to preview iframe whenever theme changes (including initial mount)
  React.useEffect(() => {
    syncBrandLogo(isDark);
    try {
      const channel = addons.getChannel();
      channel.emit(CHANNEL_EVENT, isDark ? 'dark' : 'light');
    } catch {
      // Channel not ready yet — preview will read from sessionStorage
    }
  }, [isDark]);

  // Also listen for the preview requesting current theme (handshake)
  React.useEffect(() => {
    try {
      const channel = addons.getChannel();
      const handleRequest = () => {
        channel.emit(CHANNEL_EVENT, isDark ? 'dark' : 'light');
      };
      channel.on('tuwa/request-theme', handleRequest);
      return () => channel.off('tuwa/request-theme', handleRequest);
    } catch {
      // Channel not ready
    }
  }, [isDark]);

  const handleToggle = React.useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      const nextTheme = next ? tuwaDarkTheme : tuwaTheme;
      // 1. Update manager UI
      addons.setConfig({ theme: nextTheme });
      if (api?.setOptions) {
        api.setOptions({ theme: nextTheme });
      }
      // 2. Persist
      sessionStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
      // 3. Sync data attribute and brand logo image src
      syncBrandLogo(next);
      return next;
    });
  }, [api]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', height: '100%', padding: '0 8px' }}>
      <ThemeSwitcher
        isDark={isDark}
        onToggle={handleToggle}
        ariaLabel={isDark ? labels.switchToLight : labels.switchToDark}
      />
    </div>
  );
};

// ─── Register ────────────────────────────────────────────────────────────────

// The language tool comes first, then the theme tool, as in the header of the TUWA documentation sites
addons.register('tuwa/theme-tools', (api) => {
  addons.add('tuwa/locale-tools/select', {
    title: 'Language',
    type: types.TOOL,
    match: ({ viewMode }) => !!(viewMode && viewMode.match(/^(story|docs)$/)),
    render: () => <LanguageTool />,
  });
  addons.add('tuwa/theme-tools/toggle', {
    title: 'Theme',
    type: types.TOOL,
    match: ({ viewMode }) => !!(viewMode && viewMode.match(/^(story|docs)$/)),
    render: () => <UnifiedThemeTool api={api} />,
  });
});

// ─── Language sync with the preview ──────────────────────────────────────────
// The preview asks for the language when a story or docs page mounts (`tuwa/request-locale`) and gets every change.

addons.register('tuwa/locale-sync', (api) => {
  const emitLocale = () => api.emit(SET_LOCALE_EVENT, getManagerLocale());
  // The URL names the language, so a link opens the page in it. English has no parameter. `replace`: the back button leaves the
  // page and not the language. It waits for the preview, as the URL state of the manager is not ready before
  const writeUrl = () => {
    const locale = getManagerLocale();
    api.applyQueryParams({ [LOCALE_URL_PARAM]: locale === DEFAULT_LOCALE ? null : locale }, { replace: true });
  };
  api.on(REQUEST_LOCALE_EVENT, () => {
    emitLocale();
    writeUrl();
  });
  subscribeLocale(() => {
    emitLocale();
    writeUrl();
  });
});

// ─── System preference change listener ───────────────────────────────────────

addons.register('tuwa/system-theme-sync', (api) => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', (e) => {
      const next = e.matches;
      // Only update a theme the user has already chosen; never create the key here
      if (sessionStorage.getItem(STORAGE_KEY)) sessionStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
      syncBrandLogo(next);
      api.setOptions({ theme: next ? tuwaDarkTheme : tuwaTheme });
      try {
        addons.getChannel().emit(CHANNEL_EVENT, next ? 'dark' : 'light');
      } catch {
        // noop
      }
    });
  }
});
