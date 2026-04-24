/**
 * Maps tenant JWT theme claims to :root CSS variables (client app shell + components).
 */

const FONT_STACKS = {
  inter: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};

const PRIMARY_VAR_KEYS = [
  '--color-primary-50',
  '--color-primary-100',
  '--color-primary-200',
  '--color-primary-300',
  '--color-primary-400',
  '--color-primary-500',
  '--color-primary-600',
  '--color-primary-700',
  '--color-primary-800',
  '--color-primary-900',
];

const MUTED_LIGHTNESS = {
  50: 95,
  100: 88,
  200: 78,
  300: 66,
  400: 56,
  500: 48,
  600: 40,
  700: 32,
  800: 24,
  900: 18,
};

function hexToRgb(hex) {
  const h = hex.replace(/^#/, '');
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHsl(r, g, b) {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case R:
        h = ((G - B) / d + (G < B ? 6 : 0)) / 6;
        break;
      case G:
        h = ((B - R) / d + 2) / 6;
        break;
      default:
        h = ((R - G) / d + 4) / 6;
    }
  }
  return [h * 360, s * 100, l * 100];
}

function hslToRgb(h, s, l) {
  const S = s / 100;
  const L = l / 100;
  const a = S * Math.min(L, 1 - L);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = L - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c);
  };
  return { r: f(0), g: f(8), b: f(4) };
}

function toHex({ r, g, b }) {
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

function primaryScaleFromBase(baseHex) {
  const { r, g, b } = hexToRgb(baseHex);
  const [h, s] = rgbToHsl(r, g, b);
  const map = {};
  for (const step of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]) {
    const L = MUTED_LIGHTNESS[step];
    const rgb = hslToRgb(h, Math.min(95, s + (step <= 400 ? (500 - step) * 0.02 : (500 - step) * 0.015)), L);
    map[step] = toHex(rgb);
  }
  map[500] = baseHex.toLowerCase();
  return map;
}

let appliedKeys = new Set();

function remember(key) {
  appliedKeys.add(key);
}

export function clearWorkspaceTheme() {
  const root = document.documentElement;
  for (const key of appliedKeys) {
    root.style.removeProperty(key);
  }
  appliedKeys = new Set();
}

/**
 * @param {object|null|undefined} theme - tenant_theme from JWT
 */
export function applyWorkspaceTheme(theme) {
  clearWorkspaceTheme();
  if (!theme || typeof theme !== 'object') return;

  const root = document.documentElement;

  if (theme.primary && /^#[0-9A-Fa-f]{6}$/.test(theme.primary)) {
    const scale = primaryScaleFromBase(theme.primary);
    for (const step of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]) {
      const key = `--color-primary-${step}`;
      root.style.setProperty(key, scale[step]);
      remember(key);
    }
    const rgb = hexToRgb(theme.primary);
    root.style.setProperty('--color-primary-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
    remember('--color-primary-rgb');
  }

  if (theme.radiusPx != null) {
    const n = Number(theme.radiusPx);
    if (!Number.isNaN(n) && n >= 4 && n <= 24) {
      root.style.setProperty('--tenant-shell-radius', `${n}px`);
      remember('--tenant-shell-radius');
    }
  }

  if (theme.fontPreset && FONT_STACKS[theme.fontPreset]) {
    root.style.setProperty('--font-sans', FONT_STACKS[theme.fontPreset]);
    remember('--font-sans');
  }

}
