import { useEffect, useState } from 'react';
import { chat, getCoachConfig, listGithubModels, PROVIDERS, saveCoachConfig, type CoachConfig, type Provider } from '../coach/llm';

const NOTES: Record<Provider, string> = {
  github: 'Бесплатно с твоим GitHub-аккаунтом, без карты. Лимит — десятки запросов в день, коучу хватает. Нужен токен с правом Models: Read-only.',
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
      const a = await chat([{ role: 'user', content: 'Ответь одним словом по-русски: готов?' }], c, 10);
      if (c.provider === 'github') setModels(await listGithubModels(c.apiKey));
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
      {c.provider === 'custom' && (
        <label className="field"><span>Адрес API</span><input value={c.baseUrl} placeholder="https://…/v1" onChange={(e) => setC({ ...c, baseUrl: e.target.value })} /></label>
      )}
      <label className="field">
        <span>Ключ {PROVIDERS[c.provider].keyUrl && <a className="linklike" href={PROVIDERS[c.provider].keyUrl} target="_blank" rel="noreferrer">получить</a>}</span>
        <div className="inline">
          <input type={show ? 'text' : 'password'} value={c.apiKey} placeholder={PROVIDERS[c.provider].keyHint} autoComplete="off"
            style={{ flex: 1, minWidth: 220 }} onChange={(e) => setC({ ...c, apiKey: e.target.value.trim() })} />
          <button type="button" className="btn ghost small" onClick={() => setShow((v) => !v)}>{show ? 'Скрыть' : 'Показать'}</button>
        </div>
      </label>
      <label className="field">
        <span>Модель</span>
        <input value={c.model} list="coach-models" onChange={(e) => setC({ ...c, model: e.target.value.trim() })} />
        <datalist id="coach-models">{models.map((m) => <option key={m} value={m} />)}</datalist>
      </label>
      <div className="btn-row">
        <button type="button" className="btn primary" disabled={state.busy || !c.apiKey || !c.model} onClick={check}>{state.busy ? 'Проверяю…' : 'Сохранить и проверить'}</button>
      </div>
      {state.msg && <p className={'hint' + (state.ok ? '' : ' is-error')}>{state.msg}</p>}
      <p className="hint">Ключ хранится в данных приложения и через твой Google Диск попадает на второе устройство. В репозиторий на GitHub он не попадает.</p>
    </section>
  );
}
