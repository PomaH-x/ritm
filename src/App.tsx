import { useEffect, useState } from 'react';
import { db, ensureSeed, materializeAll } from './db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRoute, useSettings, type Route } from './lib/hooks';
import WeekPage from './pages/WeekPage';
import SpheresPage from './pages/SpheresPage';
import SettingsPage from './pages/SettingsPage';
import DayPage from './pages/DayPage';
import StudentsPage from './pages/StudentsPage';
import ProgressPage from './pages/ProgressPage';
import { ToastHost } from './components/Toast';
import { ChoiceHost, ConfirmHost } from './components/Confirm';
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
  students: (
    <svg viewBox="0 0 24 24" aria-hidden><path d="M2.5 9.5 12 5l9.5 4.5L12 14z" /><path d="M6.5 11.5v4.2c1.4 1.5 3.3 2.3 5.5 2.3s4.1-.8 5.5-2.3v-4.2" /><path d="M21.5 9.5v5" /></svg>
  ),
  progress: (
    <svg viewBox="0 0 24 24" aria-hidden><path d="M4 19h16" /><path d="M5 15l4-4 3 3 6-7" /><path d="M15 7h3v3" /></svg>
  ),
  spheres: (
    <svg viewBox="0 0 24 24" aria-hidden><path d="M5 19V13M10 19V7M15 19v-9M20 19V4" /></svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" aria-hidden><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
  ),
};

const NAV: [Route, string][] = [['week', 'Неделя'], ['day', 'День'], ['students', 'Ученики'], ['progress', 'Прогресс'], ['spheres', 'Сферы'], ['settings', 'Настройки']];

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [route, go] = useRoute();
  const settings = useSettings();

  useEffect(() => {
    ensureSeed().then(() => { setReady(true); startAutoSync(); preloadGoogle(); }).catch((e) => setError(String(e?.message ?? e)));
  }, []);

  // Серии могли прийти с другого устройства или измениться — дорисовываем повторения
  const seriesStamp = useLiveQuery(async () => (await db.series.toArray()).reduce((m, s) => Math.max(m, s.updatedAt), 0), []);
  useEffect(() => { if (ready) void materializeAll(); }, [ready, seriesStamp]);

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
        {route === 'students' && <StudentsPage />}
        {route === 'progress' && <ProgressPage />}
        {route === 'spheres' && <SpheresPage />}
        {route === 'settings' && <SettingsPage />}
      </main>
      <ToastHost />
      <ConfirmHost />
      <ChoiceHost />
      <SyncChoice />
    </div>
  );
}
