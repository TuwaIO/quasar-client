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

// ─── SVG Icons (matches @heroicons/react/24/solid) ───────────────────────────

const SunIcon = ({ size = 18, color = 'currentColor', style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill={color} style={style}>
    <path d="M12 2.25a.75.75 0 0 1 .75.75v2.25a.75.75 0 0 1-1.5 0V3a.75.75 0 0 1 .75-.75ZM7.5 12a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM6.161 5.1a.75.75 0 0 1 1.06 0l1.59 1.59a.75.75 0 1 1-1.06 1.06l-1.59-1.59a.75.75 0 0 1 0-1.06Zm10.618 0a.75.75 0 0 1 0 1.06l-1.59 1.59a.75.75 0 1 1-1.06-1.06l1.59-1.59a.75.75 0 0 1 1.06 0ZM3 12a.75.75 0 0 1 .75-.75h2.25a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 12Zm15 0a.75.75 0 0 1 .75-.75h2.25a.75.75 0 0 1 0 1.5h-2.25A.75.75 0 0 1 18 12Zm-11.839 4.84a.75.75 0 0 1 1.06 1.06l-1.59 1.59a.75.75 0 1 1-1.06-1.06l1.59-1.59Zm10.618 0 1.59 1.59a.75.75 0 1 1-1.06 1.06l-1.59-1.59a.75.75 0 0 1 1.06-1.06ZM12 18.75a.75.75 0 0 1 .75.75V21a.75.75 0 0 1-1.5 0v-1.5a.75.75 0 0 1 .75-.75Z" />
  </svg>
);

const MoonIcon = ({ size = 18, color = 'currentColor', style }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill={color} style={style}>
    <path
      fillRule="evenodd"
      d="M9.528 1.718a.75.75 0 0 1 .162.819A8.97 8.97 0 0 0 9 6a9 9 0 0 0 9 9 8.97 8.97 0 0 0 3.463-.69.75.75 0 0 1 .981.98 10.503 10.503 0 0 1-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 0 1 .818.162Z"
      clipRule="evenodd"
    />
  </svg>
);

// ─── ThemeSwitcher (inline-style replica of docs-ui ThemeSwitcher) ───────────

const TRACK_W = 56;
const TRACK_H = 28;
const INDICATOR_SIZE = 24;
const ICON_SIZE = 16;
const BORDER_RADIUS = 6;

const ThemeSwitcher = ({ isDark, onToggle, ariaLabel }) => {
  const [hovered, setHovered] = React.useState(false);

  const indicatorLeft = isDark ? TRACK_W - INDICATOR_SIZE - 4 : 2;

  return (
    <button
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={ariaLabel}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        width: TRACK_W,
        height: TRACK_H,
        borderRadius: BORDER_RADIUS,
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}`,
        background: isDark
          ? hovered
            ? 'rgba(255,255,255,0.2)'
            : 'rgba(255,255,255,0.1)'
          : hovered
            ? 'rgba(0,0,0,0.1)'
            : 'rgba(0,0,0,0.05)',
        cursor: 'pointer',
        padding: '3px',
        transition: 'background 0.3s ease, border-color 0.3s ease',
        outline: 'none',
        flexShrink: 0,
        backdropFilter: 'blur(4px)',
      }}
    >
      {/* Sliding indicator */}
      <div
        style={{
          position: 'absolute',
          top: 1,
          left: indicatorLeft,
          width: INDICATOR_SIZE,
          height: INDICATOR_SIZE,
          borderRadius: BORDER_RADIUS - 1,
          background: isDark ? '#0a0e27' : '#ffffff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
          transition: 'left 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.3s ease',
          zIndex: 10,
        }}
      />

      {/* Icons row */}
      <div
        style={{
          position: 'relative',
          zIndex: 20,
          display: 'flex',
          width: '100%',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <SunIcon
            size={ICON_SIZE}
            color={!isDark ? '#eab308' : hovered ? '#facc15' : '#64748b'}
            style={{ transition: 'color 0.3s ease', position: 'relative', left: -1 }}
          />
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <MoonIcon
            size={ICON_SIZE}
            color={isDark ? '#0052ff' : hovered ? '#0052ff' : '#64748b'}
            style={{ transition: 'color 0.3s ease', position: 'relative', left: 1 }}
          />
        </div>
      </div>
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

// ─── LanguageSwitcher (inline-style replica of docs-ui LocaleSwitcher) ───────

const TRIGGER_W = 72;
const OPTION_H = 38;
const MENU_W = 192;

const FlagUK = () => (
  <svg viewBox="0 0 640 480" width={16} height={12} aria-hidden="true" style={{ display: 'block' }}>
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
  <svg viewBox="0 0 640 480" width={16} height={12} aria-hidden="true" style={{ display: 'block' }}>
    <path fill="#0057b7" d="M0 0h640v240H0z" />
    <path fill="#ffd700" d="M0 240h640v240H0z" />
  </svg>
);

const FlagChina = () => (
  <svg viewBox="0 0 640 480" width={16} height={12} aria-hidden="true" style={{ display: 'block' }}>
    <rect width="640" height="480" fill="#ee1c25" />
    <path fill="#ffde00" d="M120 72l14.1 43.4H180l-36.9 26.8 14.1 43.4-37.2-26.8-37.2 26.8 14.1-43.4L60 115.4h45.9z" />
    <circle cx="200" cy="40" r="12" fill="#ffde00" />
    <circle cx="240" cy="80" r="12" fill="#ffde00" />
    <circle cx="240" cy="140" r="12" fill="#ffde00" />
    <circle cx="200" cy="180" r="12" fill="#ffde00" />
  </svg>
);

const FLAGS = { en: FlagUK, uk: FlagUkraine, 'zh-CN': FlagChina };

const Flag = ({ code, isDark }) => {
  const Icon = FLAGS[code];
  if (!Icon) return null;
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'flex',
        flexShrink: 0,
        overflow: 'hidden',
        borderRadius: 2,
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}`,
      }}
    >
      <Icon />
    </span>
  );
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
  const accent = theme?.barSelectedColor ?? (isDark ? '#38bdf8' : '#0052ff');
  const textColor = theme?.color?.defaultText ?? (isDark ? '#f1f5f9' : '#1f2937');
  const mutedColor = theme?.barTextColor ?? (isDark ? '#94a3b8' : '#6b7280');
  const menuBg = theme?.background?.content ?? (isDark ? '#0d1230' : '#ffffff');
  const borderColor = theme?.appBorderColor ?? (isDark ? '#1e293b' : '#e5e7eb');

  const [isOpen, setIsOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [hovered, setHovered] = React.useState(false);
  const [menuPosition, setMenuPosition] = React.useState({ top: 0, left: 0 });
  const [isTouch, setIsTouch] = React.useState(false);
  const buttonRef = React.useRef(null);
  const listRef = React.useRef(null);
  const listboxId = React.useId();

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
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: TRIGGER_W,
          height: TRACK_H,
          padding: '0 8px',
          borderRadius: BORDER_RADIUS,
          border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'}`,
          background: isDark
            ? hovered
              ? 'rgba(255,255,255,0.2)'
              : 'rgba(255,255,255,0.1)'
            : hovered
              ? 'rgba(0,0,0,0.1)'
              : 'rgba(0,0,0,0.05)',
          color: textColor,
          cursor: 'pointer',
          transition: 'background 0.3s ease, border-color 0.3s ease',
          flexShrink: 0,
          backdropFilter: 'blur(4px)',
        }}
      >
        <Flag code={active.code} isDark={isDark} />
        {/* The visible label starts the accessible name (WCAG 2.5.3) */}
        <span
          style={{
            width: 20,
            textAlign: 'center',
            fontFamily: theme?.typography?.fonts?.mono,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '-0.02em',
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
              borderRadius: BORDER_RADIUS,
              border: `1px solid ${borderColor}`,
              background: menuBg,
              boxShadow: isDark ? '0 12px 32px rgba(0,0,0,0.5)' : '0 12px 32px rgba(15,23,42,0.15)',
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
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    height: OPTION_H,
                    padding: '0 14px',
                    fontSize: 12,
                    fontWeight: selected ? 700 : 400,
                    cursor: 'pointer',
                    color: selected || focused ? textColor : mutedColor,
                    background: selected
                      ? `linear-gradient(90deg, color-mix(in srgb, ${accent} ${focused ? 25 : 15}%, transparent), color-mix(in srgb, ${accent} ${focused ? 10 : 5}%, transparent), transparent)`
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
                        background: accent,
                        boxShadow: `0 0 8px ${accent}`,
                      }}
                    />
                  )}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Flag code={option.code} isDark={isDark} />
                    {option.label}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      style={{
                        padding: '2px 6px',
                        borderRadius: 4,
                        fontFamily: theme?.typography?.fonts?.mono,
                        fontSize: 10,
                        textTransform: 'uppercase',
                        color: selected ? accent : mutedColor,
                        background: selected ? `color-mix(in srgb, ${accent} 15%, transparent)` : 'transparent',
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
                          borderRadius: '50%',
                          background: accent,
                          boxShadow: `0 0 8px ${accent}`,
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
  colorPrimary: '#0052ff',
  colorSecondary: '#0284c7',
  appBg: '#ffffff',
  appContentBg: '#ffffff',
  appBorderColor: '#e5e7eb',
  appBorderRadius: 8,
  fontBase: '"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  fontCode: '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  textColor: '#1f2937',
  textInverseColor: '#ffffff',
  barTextColor: '#6b7280',
  barSelectedColor: '#0052ff',
  barHoverColor: '#0284c7',
  barBg: '#f9fafb',
  inputBg: '#ffffff',
  inputBorder: '#d1d5db',
  inputTextColor: '#1f2937',
  inputBorderRadius: 6,
});

export const tuwaDarkTheme = create({
  base: 'dark',
  brandTitle: 'TUWA Payments',
  brandUrl: 'https://www.tuwa.io/',
  brandImage: LOGO_DARK,
  brandTarget: '_self',
  colorPrimary: '#2563eb',
  colorSecondary: '#38bdf8',
  appBg: '#0a0e27',
  appContentBg: '#0d1230',
  appBorderColor: '#1e293b',
  appBorderRadius: 8,
  fontBase: '"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  fontCode: '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  textColor: '#f1f5f9',
  textInverseColor: '#0a0e27',
  barTextColor: '#94a3b8',
  barSelectedColor: '#38bdf8',
  barHoverColor: '#7dd3fc',
  barBg: '#0a0e27',
  inputBg: '#11183c',
  inputBorder: '#334155',
  inputTextColor: '#f1f5f9',
  inputBorderRadius: 6,
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
