import { useState } from 'react';
import Modal from './Modal';
import { toast } from './Toast';
import { ask } from './Confirm';
import { dativeGuess, mergeStudents, newStudent, saveStudent } from '../lib/money';
import type { Student, StudentSource } from '../types';

export default function StudentEditor({ student, source, all, onClose }: {
  student: Student | null; source: StudentSource; all: Student[]; onClose: () => void;
}) {
  const [s, setS] = useState<Student>(() => student ?? newStudent({ name: '', source }));
  const [dativeTouched, setDativeTouched] = useState(!!student && student.dative !== dativeGuess(student.name));
  const [mergeInto, setMergeInto] = useState('');
  const set = <K extends keyof Student>(k: K, v: Student[K]) => setS((x) => ({ ...x, [k]: v }));
  const others = all.filter((x) => x.id !== s.id && x.source === s.source && !x.archived);

  const save = async () => {
    if (!s.name.trim()) { toast('Укажи имя'); return; }
    await saveStudent({ ...s, name: s.name.trim(), dative: s.dative.trim() || dativeGuess(s.name.trim()) });
    toast(student ? 'Сохранено' : 'Ученик добавлен');
    onClose();
  };

  return (
    <Modal title={student ? s.name || 'Ученик' : 'Новый ученик'} onClose={onClose}
      footer={<>
        {student && (
          <button type="button" className="btn ghost danger" onClick={async () => {
            await saveStudent({ ...s, archived: !s.archived });
            toast(s.archived ? 'Ученик возвращён' : 'Ученик в архиве — история сохранена');
            onClose();
          }}>{s.archived ? 'Вернуть из архива' : 'В архив'}</button>
        )}
        <span className="spacer" />
        <button type="button" className="btn ghost" onClick={onClose}>Отмена</button>
        <button type="button" className="btn primary" onClick={save}>Сохранить</button>
      </>}>
      <div className="form">
        {s.source === 'am' ? (
          <div className="row2">
            <label className="field">
              <span>Имя</span>
              <input data-autofocus value={s.name} onChange={(e) => {
                const name = e.target.value;
                setS((x) => ({ ...x, name, dative: dativeTouched ? x.dative : dativeGuess(name) }));
              }} />
            </label>
            <label className="field">
              <span>Как писать в отчёте: «продал абонемент …»</span>
              <input value={s.dative} onChange={(e) => { setDativeTouched(true); set('dative', e.target.value); }} />
            </label>
          </div>
        ) : (
          <label className="field">
            <span>Имя</span>
            <input data-autofocus value={s.name} onChange={(e) => {
              const name = e.target.value;
              setS((x) => ({ ...x, name, dative: dativeTouched ? x.dative : dativeGuess(name) }));
            }} />
          </label>
        )}
        <div className="field">
          <span>Чей ученик</span>
          <div className="seg">
            <button type="button" className={s.source === 'am' ? 'is-on' : ''} onClick={() => set('source', 'am')}>Центр (АМ)</button>
            <button type="button" className={s.source === 'own' ? 'is-on' : ''} onClick={() => set('source', 'own')}>Мой</button>
          </div>
        </div>
        {s.source === 'am' ? (
          <p className="hint">Тариф центра выбирается у каждого занятия: групповое — если в это время в центре занимается ещё кто-то, иначе индивидуальное. Длительность — по времени занятия.</p>
        ) : (
          <label className="field">
            <span>Своя ставка за час, ₽ — пусто, если общая</span>
            <input type="number" inputMode="numeric" min={0} step={100} value={s.rate ?? ''} placeholder="общая ставка"
              onChange={(e) => set('rate', e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0))} />
          </label>
        )}
        <label className="field">
          <span>Заметка</span>
          <input value={s.note} placeholder="Например, класс или предмет" onChange={(e) => set('note', e.target.value)} />
        </label>

        {student && others.length > 0 && (
          <div className="field">
            <span>Это тот же человек, что и…</span>
            <div className="inline">
              <select value={mergeInto} onChange={(e) => setMergeInto(e.target.value)} style={{ flex: 1, minWidth: 160 }}>
                <option value="">— выбрать —</option>
                {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <button type="button" className="btn ghost small" disabled={!mergeInto} onClick={async () => {
                const target = others.find((o) => o.id === mergeInto)!;
                if (!(await ask(`«${s.name}» и «${target.name}» станут одним учеником «${target.name}»: занятия, абонементы, оплаты и отмены объединятся.`, 'Объединить'))) return;
                await mergeStudents(s.id, target.id);
                toast(`Объединено в «${target.name}»`);
                onClose();
              }}>Объединить</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
