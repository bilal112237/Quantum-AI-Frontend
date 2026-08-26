export const THEME_STORAGE_KEY = 'qai-theme';

export const THEMES = [
  {
    id: 'aurora',
    label: 'Aurora',
    description: 'Deep cosmic purple',
    swatch: ['#0f0f1a', '#8b5cf6', '#f8f7fc'],
  },
  {
    id: 'graphite',
    label: 'Graphite',
    description: 'Refined charcoal + electric blue',
    swatch: ['#18181b', '#3b82f6', '#f2f4f7'],
  },
  {
    id: 'meadow',
    label: 'Meadow',
    description: 'Sophisticated forest + mint',
    swatch: ['#0f1f17', '#34d399', '#f0fdf4'],
  },
  {
    id: 'ember',
    label: 'Ember',
    description: 'Warm copper + amber glow',
    swatch: ['#1a100f', '#f97316', '#fff7ed'],
  },
  {
    id: 'midnight',
    label: 'Midnight',
    description: 'Deep navy + cyan pulse',
    swatch: ['#0a1628', '#06b6d4', '#ecfeff'],
  },
  {
    id: 'pearl',
    label: 'Pearl',
    description: 'Clean light + soft teal',
    swatch: ['#f8fafc', '#14b8a6', '#0f172a'],
  },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

export function readStoredTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeId(stored)) return stored;
  } catch {
    // ignore
  }
  return 'aurora';
}

export function writeStoredTheme(id: ThemeId) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    // ignore
  }
}

export function applyThemeToDocument(id: ThemeId) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', id);
}