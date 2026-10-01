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

function doPost(e) {
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

  const opts = { headers: { Authorization: 'Bearer ' + key }, muteHttpExceptions: true };
  const res = req.action === 'models'
    ? UrlFetchApp.fetch(MODELS_URL, Object.assign({ method: 'get' }, opts))
    : UrlFetchApp.fetch(API_URL, Object.assign({ method: 'post', contentType: 'application/json', payload: JSON.stringify(req.body) }, opts));
  return reply(res.getResponseCode(), res.getContentText());
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
  UrlFetchApp.fetch('https://models.github.ai/catalog/models', { muteHttpExceptions: true });
}

/** Проверка без приложения: выбери testChat → «Выполнить» → смотри «Журнал выполнения» */
function testChat() {
  const key = PropertiesService.getScriptProperties().getProperty('API_KEY');
  Logger.log('API_KEY задан: ' + (key ? 'да, начинается с ' + key.slice(0, 11) : 'НЕТ'));
  Logger.log('APP_SECRET задан: ' + (PropertiesService.getScriptProperties().getProperty('APP_SECRET') ? 'да' : 'НЕТ'));
  const res = UrlFetchApp.fetch(API_URL, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + key },
    payload: JSON.stringify({ model: 'openai/gpt-4.1', messages: [{ role: 'user', content: 'Ответь одним словом: готов?' }], max_tokens: 60 }),
  });
  Logger.log('Код ответа: ' + res.getResponseCode());
  Logger.log(res.getContentText().slice(0, 1500));
}
