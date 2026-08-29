import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { LoginGate } from './components/LoginGate';
import { ThemeProvider } from './context/ThemeContext';
import { applyThemeToDocument, readStoredTheme } from './themes';
import 'highlight.js/styles/github-dark.min.css';
import './styles/global.css';
import { ErrorBoundary } from './components/ErrorBoundary';

applyThemeToDocument(readStoredTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <LoginGate>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </LoginGate>
    </ThemeProvider>
  </StrictMode>
);
