import { useState } from 'react';
import { addTask, updateTask } from '../db';
import { useTasks } from '../lib/hooks';
import { toast } from './Toast';

export default function TasksCard({ today }: { today: string }) {
  const tasks = useTasks() ?? [];
  const [title, setTitle] = useState('');
  const [showDone, setShowDone] = useState(false);
  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  const add = async () => {
    const t = title.trim();
    if (!t) return;
    await addTask(t);
    setTitle('');
  };

  return (
    <section className="sc tasks" style={{ ['--c' as string]: '#C4CAD6' }} aria-label="Ближайшие задачи">
      <header className="sc-head">
        <span className="sc-emoji" aria-hidden>📌</span>
        <div className="sc-titles"><h2>Ближайшие задачи</h2></div>
        <span className="sc-status is-part">{open.length ? `осталось ${open.length}` : 'всё сделано'}</span>
      </header>
      <div className="sc-body">
        <ul className="task-list">
          {open.map((t) => (
            <li key={t.id}>
              <button type="button" className="f-box" aria-label={`Отметить сделанным: ${t.title}`}
                onClick={() => updateTask(t.id, { done: 1, doneDate: today })} />
              <span>{t.title}</span>
              <button type="button" className="icon-btn small" aria-label={`Удалить: ${t.title}`}
                onClick={async () => {
                  await updateTask(t.id, { deleted: 1 });
                  toast('Задача удалена', { label: 'Отменить', run: () => updateTask(t.id, { deleted: 0 }) });
                }}>✕</button>
            </li>
          ))}
        </ul>
        <form className="task-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <input value={title} placeholder="Новая задача" onChange={(e) => setTitle(e.target.value)} aria-label="Новая задача" />
          <button type="submit" className="btn ghost small" disabled={!title.trim()}>Добавить</button>
        </form>
        {done.length > 0 && (
          <>
            <button type="button" className="linklike muted-link" onClick={() => setShowDone((v) => !v)}>
              {showDone ? 'Скрыть сделанные' : `Сделано: ${done.length}`}
            </button>
            {showDone && (
              <ul className="task-list is-done">
                {done.map((t) => (
                  <li key={t.id}>
                    <button type="button" className="f-box is-on" aria-label={`Вернуть: ${t.title}`}
                      onClick={() => updateTask(t.id, { done: 0, doneDate: null })}>✓</button>
                    <span>{t.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}
