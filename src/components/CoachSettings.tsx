import { useEffect, useState } from 'react';
import { chat, getCoachConfig, listModels, PROVIDERS, saveCoachConfig, type CoachConfig, type Provider } from '../coach/llm';
import { GAS_CODE } from '../coach/gas';
import { toast } from './Toast';

const NOTES: Record<Provider, string> = {
  gas: 'Запросы идут через твой скрипт на серверах Google — так обходятся и ограничения браузера, и региональные. По умолчанию — бесплатный Google Gemini. Ключ нейросети хранится только в скрипте, в приложении — секрет для связи с ним.',
  groq: 'Бесплатно, без карты, очень быстро. Может не открываться из России без VPN.',
  gemini: 'Бесплатный лимит Google. Может не работать из России без VPN; запросы бесплатного тарифа Google может использовать для улучшения своих моделей.',
  custom: 'Любой сервис с API в формате OpenAI: адрес, ключ и модель.',
};

export default function CoachSettings() {
  const [c, setC] = useState<CoachConfig | null>(null);
  const [show, setShow] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [state, setState] = useState<{ busy: boolean; msg: string; ok?: boolean }>({ busy: false, msg: '' });

  useEffect(() => { getCoachConfig().then(setC); }, []);
  if (!c) return null;

  const pick = (p: Provider) => setC({ ...c, provider: p, baseUrl: PROVIDERS[p].baseUrl || c.baseUrl, model: PROVIDERS[p].model || c.model, apiKey: p === c.provider ? c.apiKey : '' });

  const check = async () => {
    setState({ busy: true, msg: '' });
    try {
      await saveCoachConfig(c);
      const a = await chat([{ role: 'user', content: 'Ответь одним словом по-русски: готов?' }], { ...c, fallbackModel: undefined }, 1000);
      setModels(await listModels(c));
      setState({ busy: false, ok: true, msg: `Работает. Модель ответила: «${a.slice(0, 40)}»` });
    } catch (e) {
      setState({ busy: false, ok: false, msg: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <section className="card">
      <h2>ИИ-коуч</h2>
      <div className="field">
        <span>Нейросеть</span>
        <div className="seg wrap">
          {(Object.keys(PROVIDERS) as Provider[]).map((p) => (
            <button key={p} type="button" className={c.provider === p ? 'is-on' : ''} onClick={() => pick(p)}>{PROVIDERS[p].name}</button>
          ))}
        </div>
        <p className="hint">{NOTES[c.provider]}</p>
      </div>
      {c.provider === 'gas' && <GasHelp />}
      {c.provider === 'gas' && (
        <label className="field"><span>Адрес веб-приложения</span><input value={c.baseUrl} placeholder="https://script.google.com/macros/s/…/exec" onChange={(e) => setC({ ...c, baseUrl: e.target.value.trim() })} /></label>
      )}
      {c.provider === 'custom' && (
        <label className="field"><span>Адрес API</span><input value={c.baseUrl} placeholder="https://…/v1" onChange={(e) => setC({ ...c, baseUrl: e.target.value })} /></label>
      )}
      <label className="field">
        <span>{c.provider === 'gas' ? 'Секрет (тот же, что APP_SECRET в скрипте)' : 'Ключ'} {PROVIDERS[c.provider].keyUrl && <a className="linklike" href={PROVIDERS[c.provider].keyUrl} target="_blank" rel="noreferrer">получить</a>}</span>
        <div className="inline">
          <input type={show ? 'text' : 'password'} value={c.apiKey} placeholder={PROVIDERS[c.provider].keyHint} autoComplete="off"
            style={{ flex: 1, minWidth: 220 }} onChange={(e) => setC({ ...c, apiKey: e.target.value.trim() })} />
          <button type="button" className="btn ghost small" onClick={() => setShow((v) => !v)}>{show ? 'Скрыть' : 'Показать'}</button>
          {c.provider === 'gas' && (
            <button type="button" className="btn ghost small" onClick={() => {
              const a = new Uint8Array(18); crypto.getRandomValues(a);
              const secret = 'ritm-' + Array.from(a, (x) => x.toString(16).padStart(2, '0')).join('');
              setC({ ...c, apiKey: secret }); setShow(true);
            }}>Сгенерировать</button>
          )}
        </div>
      </label>
      <label className="field">
        <span>Модель</span>
        <input value={c.model} list="coach-models" onChange={(e) => setC({ ...c, model: e.target.value.trim() })} />
        <datalist id="coach-models">{models.map((m) => <option key={m} value={m} />)}</datalist>
      </label>
      <label className="field">
        <span>Запасная модель — если основная перегружена</span>
        <input value={c.fallbackModel ?? ''} list="coach-models" placeholder="можно оставить пустым" onChange={(e) => setC({ ...c, fallbackModel: e.target.value.trim() })} />
      </label>
      <div className="btn-row">
        <button type="button" className="btn primary" disabled={state.busy || !c.apiKey || !c.model} onClick={check}>{state.busy ? 'Проверяю…' : 'Сохранить и проверить'}</button>
      </div>
      {state.msg && <p className={'hint' + (state.ok ? '' : ' is-error')}>{state.msg}</p>}
      <p className="hint">{c.provider === 'gas' ? 'Секрет и адрес' : 'Ключ'} хранятся в данных приложения и через твой Google Диск попадают на второе устройство. В репозиторий на GitHub они не попадают.</p>
    </section>
  );
}

function GasHelp() {
  const [open, setOpen] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(GAS_CODE); toast('Код скопирован'); }
    catch { toast('Выдели код в поле и скопируй вручную'); }
  };
  if (!open) return <button type="button" className="linklike" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>Код скрипта и инструкция</button>;
  return (
    <div className="transfer">
      <ol className="gas-steps">
        <li>script.google.com → «Новый проект», назови «Ритм коуч».</li>
        <li>Удали всё в редакторе и вставь код ниже, нажми «Сохранить».</li>
        <li>Слева «Настройки проекта» (шестерёнка) → «Свойства скрипта» → добавь <b>API_KEY</b> = ключ Gemini (AIza…) и <b>APP_SECRET</b> = секрет из поля ниже.</li>
        <li>В редакторе выбери функцию <b>authorize</b> → «Выполнить» → разреши доступ.</li>
        <li>«Начать развёртывание» → «Новое развёртывание» → тип «Веб-приложение», запуск от «Меня», доступ «Все» → «Развернуть» → скопируй URL.</li>
      </ol>
      <div className="btn-row"><button type="button" className="btn ghost small" onClick={copy}>Копировать код</button></div>
      <textarea readOnly rows={6} value={GAS_CODE} onFocus={(e) => e.target.select()} aria-label="Код скрипта" />
    </div>
  );
}
