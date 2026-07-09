# Lampa-Plex — контекст проекта

## Проект

Репозиторий: `KZuev/Lampa-Plex` (публичный).
Основной файл: `lampa-plex.js` — плагин Plex для медиа-интерфейса Lampa (3.0+, `Lampa.Maker`/`Lampa.Component`/`Lampa.SettingsApi`).
Общение с пользователем — **на русском**.

Плагин добавляет пункт бокового меню «Медиатека Plex» (список библиотек Plex → сетка карточек фильмов/сериалов), раздел настроек «Plex» (подключение к серверу, выбор библиотек, синхронизация просмотра) и запускает воспроизведение файлов с личного Plex-сервера через `Lampa.Player` (Direct Play).

Разрабатывался по аналогии с соседним плагином [`KZuev/LampaTrakt`](https://github.com/KZuev/LampaTrakt) — оттуда взяты общие паттерны (single-file плагин, `Lampa.SettingsApi`, device-flow авторизация с QR-кодом, hybrid-интеграция с родной карточкой Lampa через `Lampa.Listener.follow('full', ...)`, синхронизация прогресса через `Lampa.Timeline`).

Коммитим и пушим **напрямую в `main`**, без PR (так же, как в LampaTrakt) — если явно не попросят иначе.

## Публикация

`.github/workflows/pages.yml` при каждом пуше в `main` публикует корень репозитория на GitHub Pages (`actions/upload-pages-artifact` + `actions/deploy-pages`), без `enablement`/повышенных прав у токена — Pages должен быть один раз включён вручную владельцем репозитория (Settings → Pages → Source: **GitHub Actions**). Ссылка для установки в Lampa: `https://kzuev.github.io/Lampa-Plex/lampa-plex.js`.

**Важно:** не добавлять в workflow разрешение `administration: write` или `enablement: true` ради автоматического включения Pages — это расширение прав CI-токена до уровня администратора репозитория уже один раз блокировалось классификатором auto-mode как самовольное повышение привилегий. Включение Pages — осознанное действие владельца репозитория, а не то, что должен делать CI.

## Архитектура плагина (`lampa-plex.js`)

Один файл, IIFE, ES5-совместимый синтаксис, без сборки. Разделы внутри файла (сверху вниз):

- **Утилиты** — `extend`, `escapeHtml`, `buildQueryString`.
- **Хранилище** (`Lampa.Storage`): `plex_server_url`, `plex_token`, `plex_client_id` (генерируется автоматически, используется как `X-Plex-Client-Identifier`), `plex_sections_selected` (JSON-массив ключей выбранных библиотек), `plex_sync_enabled` (trigger), `plex_tmdb_index` + `plex_tmdb_index_updated_at` (персистентный индекс `tmdbId → ratingKey` всей медиатеки, см. ниже).
- **HTTP-слой**: `plexRequest`/`plexUrl` — запросы к Plex Media Server, все параметры авторизации (`X-Plex-Token` и т.д.) передаются **в query-строке**, не заголовками (чтобы не упираться в CORS-preflight на произвольных локальных адресах серверов). `plexTvGet`/`plexTvUrl` — запросы к `plex.tv` (PIN-логин, список серверов).
- **`Api`** — объект с методами `identity`, `sections`, `list` (постранично + поиск через `/library/sections/{key}/search`), `metadata`, `children` (сезоны/серии).
- **Вход через Plex.tv**: `startPlexTvLogin` → `POST /api/v2/pins` → модалка с QR (как device-auth в LampaTrakt) → поллинг `GET /api/v2/pins/{id}` → `discoverServers` (`GET /api/v2/resources`) → выбор сервера при нескольких → `applyServer` сохраняет токен+URL.
- **Настройки** (`Lampa.SettingsApi`, component `'plex'`): адрес сервера/токен вручную (`Lampa.Input.edit`, паттерн 1:1 как `trakt_client_id`/`trakt_client_secret` в LampaTrakt), кнопка входа через Plex.tv, проверка соединения, выбор библиотек (`Lampa.Select.show` с чекбоксами через повторный рендер), тумблер синхронизации, сброс настроек.
- **Меню**: `Lampa.Menu.addButton` (публичный API, а не ручной jQuery-хак в `.menu__list`, который использует LampaTrakt для совместимости со старыми версиями Lampa). Если Plex не настроен — клик по пункту меню открывает настройки плагина (`Lampa.Controller.toggle('settings'); Lampa.Settings.create('plex')`).
- **Компонент `plex_library`** (`Lampa.Component.add`) — единственный кастомный Activity-компонент, тонкая обёртка над штатным `Lampa.Maker.make('Category', object)` (тот же класс, что рендерит нативные каталоги TMDB) с собственными `onCreate`/`onNext`/`onInstance`. Карточки нормализуются в `toCard()` в минимальный набор полей, подтверждённый рабочим по коду LampaTrakt (`component`, `source`, `method`, `id`, `title`, `poster`, `image`, `release_date`, `vote_average`).
- **Hybrid-роутинг карточки**: если у элемента Plex есть `Guid` с `tmdb://` (или legacy `guid` вида `themoviedb://...`) — карточка помечается `component:'full', source:'tmdb'` и `onEnter` делает `Lampa.Activity.push(element)`, открывая родную карточку Lampa. Иначе `onEnter` вызывает `openPlexDetailModal` — свою модалку (постер/описание/год из Plex + кнопка Play; для сериала — сезон/серия через `Lampa.Select.show`).
- **Индекс медиатеки** (`_plexTmdbIndex`, `rebuildTmdbIndex()`): персистентная карта `method:tmdbId → {ratingKey}`, обходит постранично (`fetchAllSectionItems`, размер страницы 200) все выбранные секции через `Api.list()`. Загружается из `Storage` при старте плагина, обновляется: (1) автоматически при инициализации, если старше 12 часов (`TMDB_INDEX_STALE_MS`, `maybeAutoRebuildTmdbIndex`, запуск отложен на 3с через `setTimeout`, чтобы не мешать старту приложения), (2) сразу после изменения списка библиотек в `pickSections()`, (3) вручную кнопкой «Обновить кэш медиатеки» в настройках (со статусом «когда обновлялось / сколько сопоставлено»). `toCard()` при построении сетки `plex_library` также дополняет этот же объект в памяти — обзор через «Медиатека Plex» мгновенно виден и до плановой пересборки.
- **Кнопка «Смотреть в Plex» на родной карточке**: `Lampa.Listener.follow('full', ...)` на событии `'complite'` смотрит в `_plexTmdbIndex[method+':'+id]` (не зависит от того, как пользователь попал на карточку — поиск, рекомендации, наша сетка — лишь бы индекс был собран хоть раз) и, если совпадение есть, вставляет кнопку в `.buttons--container` — тот самый контейнер, откуда меню «Смотреть» строит список источников (Торренты/Онлайн/…). Класс кнопки `full-start__button selector` (+ маркерный `plex-watch-btn`), внутри — инлайновый `PLEX_ICON` и `<span>` с подписью, обработчик — `.on('hover:enter', ...)`. Паттерн проверен и скопирован напрямую из `LampaTrakt` — функция `addAtButton(card, method)` создаёт кнопку «Авто-торрент» с классом `full-start__button selector trakt-magic-button`, а `onFullCardReady` вставляет её через `magicRoot.find('.buttons--container').append(atBtn)` (комментарий в их коде: «вставляем в `.buttons--container`, откуда «Смотреть» берёт список источников»). Более старая версия нашей кнопки вставлялась отдельным чипом после `.full-start-new__rate-line` и зависела от per-session `_plexTmdbMatchCache`, заполнявшегося только при просмотре собственной сетки плагина — оба ограничения устранены (см. запись в истории версий ниже).
- **Воспроизведение** — только Direct Play: `Api.metadata(ratingKey)` → `Media[0].Part[0].key` → прямая ссылка с токеном в query. Субтитры — только sidecar-дорожки (`Stream.streamType === 3`), embedded/PGS не извлекаются. `Lampa.Timeline.update`+`Lampa.Timeline.view(hash)` (`hash = 'plex_' + ratingKey`) перед `Lampa.Player.play(...)` — резюме позиции. Передача во внешний плеер — целиком на стороне самой Lampa (`Storage.field('player'...)`), плагин не реализует ничего специально для этого.
- **Синхронизация прогресса**: `Lampa.Player.listener.follow('destroy', ...)` читает `Lampa.Timeline.view(hash)` и шлёт `GET /:/timeline` (+ `/:/scrobble` при ≥90%) на сервер Plex.

## Известные ограничения (см. также README)

- Только Direct Play — нет серверного транскодирования Plex (HLS-сессии, `/video/:/transcode/universal/*`). Файлы в несовместимых кодеках (HEVC/DTS и т.п.) не воспроизводятся, если ни встроенный, ни внешний плеер их не тянут напрямую.
- Субтитры — только внешние (sidecar), не встроенные в контейнер.
- Синхронизация прогресса при внешнем плеере зависит от того, возвращает ли конкретный внешний плеер позицию обратно в `Lampa.Timeline` — как и для любых других источников в Lampa, это вне контроля плагина.
- Одна выбранная секция на попытку сохранения нескольких Plex-серверов на один аккаунт не тестировалась специально; при входе через plex.tv можно выбрать сервер из списка, переключение — через повторный вход или ручную правку адреса.

## История версий

**v1.0.0** — Первая версия. Настройки Plex (сервер/токен вручную + вход через plex.tv), пункт меню «Медиатека Plex», компонент `plex_library` на `Lampa.Maker.make('Category', ...)`, hybrid-интеграция с родной карточкой (кнопка «Смотреть в Plex»), собственная модалка для несопоставленного с TMDB контента + сезон/серии через `Select`, Direct Play через `Lampa.Player.play`, синхронизация прогресса с Plex (`/:/timeline`, `/:/scrobble`).

**Публикация на GitHub Pages** — добавлен `.github/workflows/pages.yml` (копия воркфлоу LampaTrakt). Первый прогон упал (`Get Pages site failed... Not Found`) — Pages не был включён в настройках репозитория; включили вручную (Settings → Pages → Source: GitHub Actions), повторный запуск (пустой коммит) прошёл успешно. Попытка исправить это добавлением `enablement: true` + `administration: write` в workflow была заблокирована auto-mode классификатором как самовольное расширение прав CI-токена — оставлено как есть, без auto-enablement.

**Иконка плагина** — значок в левом меню и в настройках заменён на настоящий логотип Plex (инлайн SVG, один `path fill="currentColor"`, путь из проекта Simple Icons, CC0) — по аналогии с `TRAKT_ICON` у LampaTrakt.

**Кнопка «Смотреть в Plex» → обычный источник + персистентный индекс медиатеки** — по просьбе пользователя приведена в соответствие с тем, как в LampaTrakt сделана кнопка «Авто-торрент»: перенесена из отдельного чипа после `.full-start-new__rate-line` в общий `.buttons--container` (класс `full-start__button selector`, значок Plex вместо текстового «▶»). Одновременно устранена зависимость от истории навигации: раньше кнопка появлялась только на тайтлах, которые пользователь уже пролистал через «Медиатека Plex» в текущей сессии (`_plexTmdbMatchCache` заполнялся исключительно в `toCard()`). Теперь `_plexTmdbIndex` — персистентная в `Lampa.Storage` карта `tmdbId → ratingKey` по всей медиатеке (все выбранные секции, постранично), собирается автоматически при старте (если старше 12 ч), после изменения списка библиотек и вручную кнопкой «Обновить кэш медиатеки» — кнопка теперь показывается на любой карточке независимо от способа перехода на неё, как только индекс собран хотя бы раз.
