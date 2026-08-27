import { useTheme } from '../context/ThemeContext';
import type { ThemeId } from '../themes';

type ThemeSwitcherProps = {
  variant?: 'dialog' | 'inline';
  onSelect?: (id: ThemeId) => void;
};

export function ThemeSwitcher({ variant = 'inline', onSelect }: ThemeSwitcherProps) {
  const { theme, setTheme, themes } = useTheme();

  return (
    <div
      className={`theme-switcher theme-switcher--${variant}`}
      role="group"
      aria-label="Appearance themes"
    >
      <div className="theme-swatch-row">
        {themes.map((item) => {
          const active = theme === item.id;
          const [bg, accent] = item.swatch;
          return (
            <button
              key={item.id}
              type="button"
              className={`theme-swatch${active ? ' is-active' : ''}`}
              aria-pressed={active}
              aria-label={`${item.label} theme`}
              title={`${item.label} — ${item.description}`}
              onClick={() => {
                setTheme(item.id);
                onSelect?.(item.id);
              }}
            >
              <div
                className="theme-swatch-preview"
                style={{
                  background: `linear-gradient(135deg, ${bg} 0%, ${accent} 100%)`,
                }}
              >
                <img src={item.logo} alt="" className="theme-swatch-logo" />
              </div>
              <span className="theme-swatch-name">{item.label}</span>
              {variant === 'dialog' ? (
                <span className="theme-swatch-desc">{item.description}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}