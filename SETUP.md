# Запуск на GitHub Pages и синхронизация через Google Диск

## 1. GitHub Pages

1. Создай репозиторий `ritm` на https://github.com/new (Public, без README).
2. В репозитории: Settings → Pages → Build and deployment → Source: **GitHub Actions**.
3. Code → Add file → Upload files. Перетащи всё содержимое папки `ritm` из архива
   (включая папку `.github`), без `node_modules`. Commit changes.
4. Вкладка Actions: дождись зелёной галочки у «deploy» (1–3 минуты).
5. Приложение: https://pomah-x.github.io/ritm/

На Android: открыть ссылку в Chrome → ⋮ → «Установить приложение».

## 2. Google Cloud (один раз)

1. https://console.cloud.google.com → вход под romanermakov2004@gmail.com → «Новый проект» → `Ritm`.
2. https://console.cloud.google.com/apis/library/drive.googleapis.com → «Включить».
3. Google Auth Platform → «Начать»: название «Ритм», почта поддержки, Audience: External, контакт → Создать.
4. Audience → Test users → добавить romanermakov2004@gmail.com.
5. Data access → Add or remove scopes → `.../auth/drive.appdata` → Update → Save.
6. Clients → Create client → Web application → Authorized JavaScript origins:
   `https://pomah-x.github.io` (и `http://localhost:5173` для разработки) → Create.
7. Скопируй Client ID (`….apps.googleusercontent.com`) и вставь в `src/config.ts`
   (на GitHub: открыть файл → карандаш → вставить между кавычками → Commit). Через пару минут
   приложение обновится. Client ID — не секрет.

## 3. Подключение

- Компьютер: Настройки → Синхронизация → «Подключить Google Диск» → аккаунт →
  «Google не проверил это приложение» → «Продолжить» → разрешить.
- Телефон: то же самое, на вопрос выбрать «Взять данные с Диска».

Google выдаёт доступ на час. Пока он действует, синхронизация идёт сама (при открытии, после правок,
при возвращении в приложение). Когда кнопка стала жёлтой «Синхронизировать» — одно нажатие.
