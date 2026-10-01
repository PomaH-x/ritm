/**
 * Ритм — посредник для ИИ-коуча.
 * Браузер не может напрямую обратиться к GitHub Models, а этот скрипт работает на серверах Google
 * и пересылает запрос. Токен GitHub хранится только здесь, в свойствах скрипта.
 *
 * Свойства скрипта (Настройки проекта → Свойства скрипта):
 *   API_KEY    — токен GitHub (github_pat_…) с правом Models: Read-only
 *   APP_SECRET — секрет из настроек приложения «Ритм»
 */
const API_URL = 'https://models.github.ai/inference/chat/completions';
const MODELS_URL = 'https://models.github.ai/catalog/models';
const GH_HEADERS = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };

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

    const opts = { headers: Object.assign({ Authorization: 'Bearer ' + key }, GH_HEADERS), muteHttpExceptions: true };
    const res = req.action === 'models'
      ? UrlFetchApp.fetch(MODELS_URL, Object.assign({ method: 'get' }, opts))
      : UrlFetchApp.fetch(API_URL, Object.assign({ method: 'post', contentType: 'application/json', payload: JSON.stringify(req.body) }, opts));
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
  UrlFetchApp.fetch(MODELS_URL, { muteHttpExceptions: true });
}

/** Диагностика: выбери diagnose → «Выполнить» → пришли «Журнал выполнения» */
function diagnose() {
  const key = PropertiesService.getScriptProperties().getProperty('API_KEY');
  Logger.log('API_KEY: ' + (key ? key.slice(0, 11) + '…, длина ' + key.length : 'НЕТ'));
  const body = JSON.stringify({ model: 'openai/gpt-4.1', messages: [{ role: 'user', content: 'Ответь одним словом: готов?' }], max_tokens: 60 });
  const variants = [
    ['1 без заголовков', {}],
    ['2 версия 2022-11-28', { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }],
    ['3 версия 2026-03-10', { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10' }],
  ];
  variants.forEach(function (v) {
    const r = UrlFetchApp.fetch(API_URL, {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true, followRedirects: false,
      headers: Object.assign({ Authorization: 'Bearer ' + key }, v[1]), payload: body,
    });
    const h = r.getHeaders();
    Logger.log(v[0] + ': код ' + r.getResponseCode() + ', тип ' + (h['Content-Type'] || h['content-type'] || '?')
      + (h['Location'] ? ', переадресация на ' + h['Location'] : '') + ', ответ: ' + r.getContentText().slice(0, 300));
  });
  const c = UrlFetchApp.fetch(MODELS_URL, { muteHttpExceptions: true, headers: Object.assign({ Authorization: 'Bearer ' + key }, GH_HEADERS) });
  Logger.log('каталог моделей: код ' + c.getResponseCode() + ', ответ: ' + c.getContentText().slice(0, 200));
}
