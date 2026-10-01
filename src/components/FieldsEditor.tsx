import { useState } from 'react';
import Modal from './Modal';
import { saveSectionsConfig, uid } from '../db';
import { BUILTIN_SECTIONS, FIELD_TYPES } from '../lib/sections';
import type { FieldDef, FieldType, SectionDef, SectionsConfig } from '../types';
import { toast } from './Toast';
import { ask } from './Confirm';

interface Props {
  cfg: SectionsConfig;
  section: SectionDef; // со всеми полями, включая скрытые
  onClose: () => void;
}

export default function FieldsEditor({ cfg, section, onClose }: Props) {
  const builtin = BUILTIN_SECTIONS.some((s) => s.key === section.key);
  const [hidden, setHidden] = useState<string[]>(cfg.hiddenFields[section.key] ?? []);
  const [extra, setExtra] = useState<FieldDef[]>(cfg.extraFields[section.key] ?? []);
  const [title, setTitle] = useState(section.title);
  const [emoji, setEmoji] = useState(section.emoji);
  const [nf, setNf] = useState<{ label: string; type: FieldType; unit: string; options: string }>({ label: '', type: 'number', unit: '', options: '' });

  const baseFields = builtin
    ? BUILTIN_SECTIONS.find((s) => s.key === section.key)!.fields
    : (cfg.customSections.find((s) => s.key === section.key)?.fields ?? []);

  const addField = () => {
    if (!nf.label.trim()) return;
    const f: FieldDef = {
      key: 'f_' + uid().slice(0, 8), label: nf.label.trim(), type: nf.type, custom: true,
      ...(nf.type === 'number' ? { unit: nf.unit.trim() || undefined, step: 1 } : {}),
      ...(nf.type === 'choice' ? { options: nf.options.split(',').map((o) => o.trim()).filter(Boolean) } : {}),
    };
    setExtra((x) => [...x, f]);
    setNf({ label: '', type: nf.type, unit: '', options: '' });
  };

  const save = async () => {
    const next: SectionsConfig = {
      ...cfg,
      hiddenFields: { ...cfg.hiddenFields, [section.key]: hidden },
      extraFields: { ...cfg.extraFields, [section.key]: extra },
      customSections: cfg.customSections.map((s) => (s.key === section.key ? { ...s, title: title.trim() || s.title, emoji } : s)),
    };
    await saveSectionsConfig(next);
    toast('Поля сохранены');
    onClose();
  };

  const hideSection = async () => {
    if (!(await ask(`Раздел «${section.title}» пропадёт со страницы дня. Записи сохранятся, вернуть можно внизу страницы.`, 'Скрыть раздел'))) return;
    await saveSectionsConfig({ ...cfg, hiddenSections: [...cfg.hiddenSections, section.key] });
    onClose();
  };

  return (
    <Modal title={`Поля: ${section.title}`} onClose={onClose}
      footer={<>
        <button type="button" className="btn ghost danger" onClick={hideSection}>Скрыть раздел</button>
        <span className="spacer" />
        <button type="button" className="btn ghost" onClick={onClose}>Отмена</button>
        <button type="button" className="btn primary" onClick={save}>Сохранить</button>
      </>}>
      <div className="form">
        {!builtin && (
          <div className="row2">
            <label className="field"><span>Название раздела</span><input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
            <label className="field narrow"><span>Значок</span><input value={emoji} maxLength={4} onChange={(e) => setEmoji(e.target.value)} /></label>
          </div>
        )}
        <ul className="fe-list">
          {baseFields.map((f) => (
            <li key={f.key}>
              <label className="toggle">
                <input type="checkbox" checked={!hidden.includes(f.key)}
                  onChange={(e) => setHidden((h) => (e.target.checked ? h.filter((k) => k !== f.key) : [...h, f.key]))} />
                {f.label}
              </label>
              <span className="muted">{FIELD_TYPES.find(([t]) => t === f.type)?.[1]}</span>
            </li>
          ))}
          {extra.map((f) => (
            <li key={f.key}>
              <span className="fe-custom">{f.label}</span>
              <span className="muted">{FIELD_TYPES.find(([t]) => t === f.type)?.[1]}{f.unit ? `, ${f.unit}` : ''}</span>
              <button type="button" className="icon-btn small" aria-label={`Удалить поле ${f.label}`}
                onClick={() => setExtra((x) => x.filter((y) => y.key !== f.key))}>✕</button>
            </li>
          ))}
        </ul>

        <h3 className="section-title">Новое поле</h3>
        <div className="row2">
          <label className="field"><span>Название</span><input value={nf.label} placeholder="например, Шаги" onChange={(e) => setNf({ ...nf, label: e.target.value })} /></label>
          <label className="field"><span>Тип</span>
            <select value={nf.type} onChange={(e) => setNf({ ...nf, type: e.target.value as FieldType })}>
              {FIELD_TYPES.map(([t, l]) => <option key={t} value={t}>{l}</option>)}
            </select>
          </label>
        </div>
        {nf.type === 'number' && <label className="field"><span>Единица</span><input value={nf.unit} placeholder="мин, шт., км" onChange={(e) => setNf({ ...nf, unit: e.target.value })} /></label>}
        {nf.type === 'choice' && <label className="field"><span>Варианты через запятую</span><input value={nf.options} onChange={(e) => setNf({ ...nf, options: e.target.value })} /></label>}
        <button type="button" className="btn ghost" onClick={addField} disabled={!nf.label.trim()}>Добавить поле</button>
        <p className="hint">Удалённое поле пропадает из формы, а уже записанные значения остаются в данных.</p>
      </div>
    </Modal>
  );
}

export function NewSectionModal({ cfg, onClose, onCreated }: { cfg: SectionsConfig; onClose: () => void; onCreated: (key: string) => void }) {
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState('✨');
  const create = async () => {
    if (!title.trim()) return;
    const key = 's_' + uid().slice(0, 8);
    const sec: SectionDef = { key, title: title.trim(), emoji, color: '#9AA6BD', kind: 'generic', fields: [], custom: true };
    await saveSectionsConfig({ ...cfg, customSections: [...cfg.customSections, sec] });
    onCreated(key);
  };
  return (
    <Modal title="Новый раздел" onClose={onClose}
      footer={<><span className="spacer" /><button type="button" className="btn ghost" onClick={onClose}>Отмена</button><button type="button" className="btn primary" disabled={!title.trim()} onClick={create}>Создать</button></>}>
      <div className="form">
        <div className="row2">
          <label className="field"><span>Название</span><input data-autofocus value={title} placeholder="например, Чтение" onChange={(e) => setTitle(e.target.value)} /></label>
          <label className="field narrow"><span>Значок</span><input value={emoji} maxLength={4} onChange={(e) => setEmoji(e.target.value)} /></label>
        </div>
        <p className="hint">После создания откроется настройка полей.</p>
      </div>
    </Modal>
  );
}
