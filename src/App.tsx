import { useEffect, useState } from 'react';
import { ensureSeed } from './db';
import { useRoute, useSettings, type Route } from './lib/hooks';
import WeekPage from './pages/WeekPage';
import SpheresPage from './pages/SpheresPage';
import SettingsPage from './pages/SettingsPage';
import DayPage from './pages/DayPage';
import ReportsPage from './pages/ReportsPage';
import { ToastHost } from './components/Toast';
import { ConfirmHost } from './components/Confirm';
import SyncChoice from './components/SyncChoice';
import { startAutoSync } from './sync/engine';
import { preloadGoogle } from './sync/google';

const icons: Record<Route, JSX.Element> = {
  week: (
    <svg viewBox="0 0 24 24" aria-hidden><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
  ),
  day: (
    <svg viewBox="0 0 24 24" aria-hidden><path d="M7 4.5h10a2 2 0 0 1 2 2v13l-3-2-3 2-3-2-3 2v-13a2 2 0 0 1 2-2Z" /><path d="M9 9.5l2 2 4-4" /></svg>
  ),
  reports: (
    <svg viewBox="0 0 24 24" aria-hidden><path d="M6 3.5h8l4 4v13H6z" /><path d="M14 3.5v4h4M9 12h6M9 15.5h6M9 8.5h2" /></svg>
  ),
  spheres: (
    <svg viewBox="0 0 24 24" aria-hidden><path d="M5 19V13M10 19V7M15 19v-9M20 19V4" /></svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" aria-hidden><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
  ),
};

const NAV: [Route, string][] = [['week', 'Неделя'], ['day', 'День'], ['reports', 'Отчёты'], ['spheres', 'Сферы'], ['settings', 'Настройки']];

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [route, go] = useRoute();
  const settings = useSettings();

  useEffect(() => {
    ensureSeed().then(() => { setReady(true); startAutoSync(); preloadGoogle(); }).catch((e) => setError(String(e?.message ?? e)));
  }, []);

  useEffect(() => {
    const el = document.documentElement;
    if (settings.theme === 'system') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  if (error) {
    return (
      <div className="boot">
        <p>Не удалось открыть локальную базу: {error}</p>
        <p className="muted">Проверь, что браузер не в режиме инкогнито и разрешает хранить данные сайтов.</p>
      </div>
    );
  }
  if (!ready) return <div className="boot" aria-busy>Загрузка…</div>;

  return (
    <div className="app">
      <nav className="rail" aria-label="Разделы">
        <div className="brand" aria-label="Ритм">
          <svg viewBox="0 0 32 32" aria-hidden>
            <g strokeLinecap="round" strokeWidth="3.4">
              <line x1="7" y1="25" x2="7" y2="19" stroke="#4F8CFF" />
              <line x1="12" y1="25" x2="12" y2="12" stroke="#EC6FCF" />
              <line x1="17" y1="25" x2="17" y2="16" stroke="#A98BFF" />
              <line x1="22" y1="25" x2="22" y2="8" stroke="#FF8A3D" />
              <line x1="27" y1="25" x2="27" y2="15" stroke="#3FB27F" />
            </g>
          </svg>
          <span>Ритм</span>
        </div>
        {NAV.map(([r, label]) => (
          <button key={r} type="button" className={'rail-item' + (route === r ? ' is-on' : '')}
            aria-current={route === r ? 'page' : undefined} onClick={() => go(r)}>
            {icons[r]}
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <main className="content">
        {route === 'week' && <WeekPage />}
        {route === 'day' && <DayPage />}
        {route === 'reports' && <ReportsPage />}
        {route === 'spheres' && <SpheresPage />}
        {route === 'settings' && <SettingsPage />}
      </main>
      <ToastHost />
      <ConfirmHost />
      <SyncChoice />
    </div>
  );
}
