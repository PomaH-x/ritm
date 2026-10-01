/**
 * Ритм — посредник для ИИ-коуча.
 * Скрипт работает на серверах Google и пересылает запросы нейросети, которая говорит на языке OpenAI API.
 * По умолчанию — Google Gemini (бесплатный тариф). Ключ хранится только здесь.
 *
 * Свойства скрипта (Настройки проекта → Свойства скрипта):
 *   API_KEY    — ключ нейросети (для Gemini начинается с AIza…)
 *   APP_SECRET — секрет из настроек приложения «Ритм»
 *   API_BASE   — необязательно; адрес другой совместимой нейросети, например https://api.groq.com/openai/v1
 */
const DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai';

function base() {
  return (PropertiesService.getScriptProperties().getProperty('API_BASE') || DEFAULT_BASE).replace(/\/$/, '');
}

/**
 * Запрос к нейросети. Сначала ключ передаём как Bearer (так принято в формате OpenAI);
 * если сервис его не принял — как x-goog-api-key (так Google принимает новые ключи вида AQ.…).
 */
function callApi(path, opts) {
  const key = PropertiesService.getScriptProperties().getProperty('API_KEY');
  const url = base() + path;
  const first = UrlFetchApp.fetch(url, Object.assign({}, opts, { muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + key } }));
  const code = first.getResponseCode();
  if ((code === 400 || code === 401 || code === 403) && url.indexOf('googleapis.com') >= 0) {
    return UrlFetchApp.fetch(url, Object.assign({}, opts, { muteHttpExceptions: true, headers: { 'x-goog-api-key': key } }));
  }
  return first;
}

function doPost(e) {
  try {
    const props = PropertiesService.getScriptProperties();
    let req;
    try {
      req = JSON.parse(e.postData.contents);
    } catch (err) {
      return reply(400, 'Некорректный запрос');
    }
    if (!req.secret || req.secret !== props.getProperty('APP_SECRET')) return reply(401, 'Неверный секрет');
    const key = props.getProperty('API_KEY');
    if (!key) return reply(500, 'В свойствах скрипта не задан API_KEY');

    const res = req.action === 'models'
      ? callApi('/models', { method: 'get' })
      : callApi('/chat/completions', { method: 'post', contentType: 'application/json', payload: JSON.stringify(req.body) });
    return reply(res.getResponseCode(), res.getContentText());
  } catch (err) {
    return reply(502, 'Ошибка в скрипте: ' + err);
  }
}

function doGet() {
  return reply(200, 'Ритм: посредник работает');
}

function reply(status, body) {
  return ContentService.createTextOutput(JSON.stringify({ status: status, body: body }))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Запусти один раз вручную, чтобы Google попросил разрешение на внешние запросы */
function authorize() {
  UrlFetchApp.fetch(base() + '/models', { muteHttpExceptions: true });
}

/** Диагностика: выбери diagnose → «Выполнить» → пришли «Журнал выполнения» */
function diagnose() {
  const key = PropertiesService.getScriptProperties().getProperty('API_KEY');
  Logger.log('Версия скрипта: Gemini-2. Адрес: ' + base());
  Logger.log('API_KEY: ' + (key ? key.slice(0, 3) + '…, длина ' + key.length : 'НЕТ'));
  const ask = { model: 'gemini-3.8-flash', messages: [{ role: 'user', content: 'Ответь одним словом: готов?' }], max_tokens: 300 };
  [['Bearer', { Authorization: 'Bearer ' + key }], ['x-goog-api-key', { 'x-goog-api-key': key }]].forEach(function (v) {
    const r = UrlFetchApp.fetch(base() + '/chat/completions', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true, headers: v[1], payload: JSON.stringify(ask),
    });
    Logger.log('Чат, ключ как ' + v[0] + ': код ' + r.getResponseCode() + ', ответ: ' + r.getContentText().slice(0, 400));
  });
  const n = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true, headers: { 'x-goog-api-key': key },
    payload: JSON.stringify({ contents: [{ parts: [{ text: 'Ответь одним словом: готов?' }] }] }),
  });
  Logger.log('Родной формат Gemini: код ' + n.getResponseCode() + ', ответ: ' + n.getContentText().slice(0, 300));
  const m = callApi('/models', { method: 'get' });
  let ids = [];
  try { ids = JSON.parse(m.getContentText()).data.map(function (x) { return x.id.replace('models/', ''); }); } catch (err) {}
  Logger.log('Модели: код ' + m.getResponseCode() + ', ' + (ids.length ? ids.filter(function (i) { return /gemini/i.test(i) && !/embedding|image|tts|audio|live/i.test(i); }).slice(0, 30).join(', ') : m.getContentText().slice(0, 300)));
}
