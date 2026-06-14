import { Moon, Sun } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import V2App from './app-v2/App';

type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'eks-upgrade-planner:theme';

function storedTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
}

function WorkspaceControls({
  theme,
  setTheme,
}: {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
}) {
  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  return <div className="flex items-center gap-2">
    <button
      type="button"
      aria-label={`Switch to ${nextTheme} theme`}
      title={`Switch to ${nextTheme} theme`}
      onClick={() => setTheme(nextTheme)}
      className="inline-flex size-7 items-center justify-center rounded-md border border-chrome-border bg-chrome-surface text-chrome-text transition-colors hover:bg-chrome-hover"
    >
      {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
    </button>
  </div>;
}

function App() {
  const [theme, setTheme] = useState<ThemeMode>(storedTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.appVersion = 'v2';
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content',
      theme === 'dark' ? '#0D1117' : '#F0F4F8',
    );
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.appVersion = 'v2';
  }, []);

  const controls = useMemo(() => (
    <WorkspaceControls
      theme={theme}
      setTheme={setTheme}
    />
  ), [theme]);

  return <ErrorBoundary>
    <V2App workspaceControls={controls}/>
  </ErrorBoundary>;
}

export default App;
