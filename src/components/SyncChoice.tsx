import Modal from './Modal';
import { resolveChoice, useSyncStatus } from '../sync/engine';

/** Первое подключение устройства, когда на Диске уже есть данные */
export default function SyncChoice() {
  const s = useSyncStatus();
  if (!s.needChoice) return null;
  return (
    <Modal title="На Диске уже есть данные" onClose={() => resolveChoice(null)}
      footer={<>
        <button type="button" className="btn ghost" onClick={() => resolveChoice('merge')}>Объединить</button>
        <span className="spacer" />
        <button type="button" data-autofocus className="btn primary" onClick={() => resolveChoice('replace')}>Взять данные с Диска</button>
      </>}>
      <p className="confirm-text">
        Похоже, это второе устройство. Если здесь ты ничего важного не вводил, выбери «Взять данные с Диска» —
        это устройство получит ровно то же, что на другом.
      </p>
      <p className="confirm-text muted" style={{ marginTop: 10 }}>
        «Объединить» сохранит и то, и другое. Начальные сферы и рабочие занятия тогда задвоятся, их придётся удалить вручную.
      </p>
    </Modal>
  );
}
