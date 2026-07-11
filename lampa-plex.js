/**
 * Lampa-Plex — медиатека личного Plex-сервера внутри Lampa.
 * Показывает медиатеки Plex (фильмы/сериалы) и запускает Direct Play через Lampa.Player,
 * с автоматической передачей во внешний плеер, если так настроено в самой Lampa.
 */
(function () {
    'use strict';

    if (window.plex_plugin_ready) return;
    window.plex_plugin_ready = true;

    var PLUGIN_VERSION = '1.7.0';
    var PLEX_TV = 'https://plex.tv';
    var PLEX_PRODUCT = 'Lampa Plex';

    var PLEX_ICON = '<svg class="plex-brand-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">' +
        '<path fill="currentColor" d="M3.987 8.409c-.96 0-1.587.28-2.12.933v-.72H0v8.88s.038.018.127.037c.138.03.821.187 1.331-.249.441-.377.542-.814.542-1.318v-1.283c.533.573 1.147.813 2 .813 1.84 0 3.253-1.493 3.253-3.48 0-2.12-1.36-3.613-3.266-3.613Zm16.748 5.595.406.591c.391.614.894.906 1.492.908.621-.012 1.064-.562 1.226-.755 0 0-.307-.27-.686-.72-.517-.614-1.214-1.755-1.24-1.803l-1.198 1.779Zm-3.205-1.955c0-2.08-1.52-3.64-3.52-3.64s-3.467 1.587-3.467 3.573a3.48 3.48 0 0 0 3.507 3.52c1.413 0 2.626-.84 3.253-2.293h-2.04l-.093.093c-.427.4-.72.533-1.227.533-.787 0-1.373-.506-1.453-1.266h4.986c.04-.214.054-.307.054-.52Zm-7.671-.219c0 .769.11 1.701.868 2.722l.056.069c-.306.526-.742.88-1.248.88-.399 0-.814-.211-1.138-.579a2.177 2.177 0 0 1-.538-1.441V6.409H9.86l-.001 5.421Zm9.283 3.46h-2.39l2.247-3.332-2.247-3.335h2.39l2.248 3.335-2.248 3.332Zm1.593-1.286Zm-17.162-.342c-.933 0-1.68-.773-1.68-1.72s.76-1.666 1.68-1.666c.92 0 1.68.733 1.68 1.68 0 .946-.733 1.706-1.68 1.706Zm18.361-1.974L24 8.622h-2.391l-.87 1.293 1.195 1.773Zm-9.404-.466c.16-.706.72-1.133 1.493-1.133.773 0 1.373.467 1.507 1.133h-3Z"/>' +
        '</svg>';

    // Значок для кнопки "Смотреть из Plex" — стрелка-play из официального
    // app-иконки Plex (dashboard-icons: rounded square #282a2d + arrow #e5a00d).
    // Стрелка — currentColor (наследует цвет темы/фокуса, как остальные значки
    // Lampa). Вокруг — контур того самого скруглённого квадрата-рамки из
    // оригинальной иконки, но не залитый, а только обводка фиксированным белым
    // (не currentColor) по краю, чтобы форма всегда читалась чётко. Именно
    // из-за этого фиксированного #fff (не currentColor) значок непригоден для
    // левого меню: Lampa на фокусе перекрашивает currentColor-элементы под
    // контраст с подсветкой пункта, а фиксированная белая рамка не участвует
    // в этом и на некоторых подсветках превращается в «тёмный квадрат без
    // стрелки» (сообщено пользователем) — рамка глушит стрелку визуально.
    var PLEX_PLAY_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none" aria-hidden="true" focusable="false">' +
        '<rect x="12" y="12" width="488" height="488" rx="76" fill="none" stroke="#fff" stroke-width="24"/>' +
        '<path fill="currentColor" d="M256 70H148l108 186-108 186h108l108-186z"/>' +
        '</svg>';

    // Та же стрелка-play для левого меню, но без фиксированной рамки —
    // целиком currentColor (как PLEX_ICON/plex-brand-icon), чтобы корректно
    // перекрашивалась в состоянии фокуса вместе с остальным пунктом меню.
    var PLEX_MENU_ICON = '<svg class="plex-brand-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none" aria-hidden="true" focusable="false">' +
        '<path fill="currentColor" d="M256 70H148l108 186-108 186h108l108-186z"/>' +
        '</svg>';

    // В левом меню — тот же мотив (стрелка-play), что и у кнопки «Смотреть
    // из Plex» на карточке (по просьбе пользователя), а не логотип-вихрь.
    // В настройках логотип остаётся прежним.
    var ICON_MENU = PLEX_MENU_ICON;
    var ICON_SETTINGS = PLEX_ICON;

    // ---------------------------------------------------------------------
    // Утилиты
    // ---------------------------------------------------------------------

    function extend(target) {
        for (var i = 1; i < arguments.length; i++) {
            var src = arguments[i] || {};
            for (var k in src) if (src.hasOwnProperty(k)) target[k] = src[k];
        }
        return target;
    }

    function escapeHtml(s) {
        var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
        return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) { return map[c]; });
    }

    function buildQueryString(params) {
        var parts = [];
        for (var key in params) {
            if (!params.hasOwnProperty(key)) continue;
            var val = params[key];
            if (val === undefined || val === null || val === '') continue;
            parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(val));
        }
        return parts.join('&');
    }

    // ---------------------------------------------------------------------
    // Хранилище настроек
    // ---------------------------------------------------------------------

    function getClientId() {
        var id = Lampa.Storage.get('plex_client_id');
        if (!id) {
            id = 'lampa-plex-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
            Lampa.Storage.set('plex_client_id', id);
        }
        return id;
    }

    function getServerUrl() { return (Lampa.Storage.get('plex_server_url') || '').replace(/\/+$/, ''); }
    function setServerUrl(v) { Lampa.Storage.set('plex_server_url', (v || '').trim().replace(/\/+$/, '')); }
    function getToken() { return Lampa.Storage.get('plex_token') || ''; }
    function setToken(v) { Lampa.Storage.set('plex_token', (v || '').trim()); }
    function isConfigured() { return !!(getServerUrl() && getToken()); }

    function getSections() {
        var v = Lampa.Storage.get('plex_sections_selected', []);
        return Array.isArray(v) ? v : [];
    }
    function setSections(arr) { Lampa.Storage.set('plex_sections_selected', JSON.stringify(arr || [])); }

    function syncEnabled() { return Lampa.Storage.get('plex_sync_enabled', true) !== false; }

    function getStoredTmdbIndex() {
        var v = Lampa.Storage.get('plex_tmdb_index', {});
        return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
    }
    function setStoredTmdbIndex(map) {
        Lampa.Storage.set('plex_tmdb_index', JSON.stringify(map || {}));
        Lampa.Storage.set('plex_tmdb_index_updated_at', Date.now());
    }
    function getTmdbIndexUpdatedAt() { return Number(Lampa.Storage.get('plex_tmdb_index_updated_at', 0)) || 0; }

    // ---------------------------------------------------------------------
    // Низкоуровневые запросы: Plex Media Server и plex.tv
    // ---------------------------------------------------------------------

    function plexAuthParams() {
        return {
            'X-Plex-Token': getToken(),
            'X-Plex-Client-Identifier': getClientId(),
            'X-Plex-Product': PLEX_PRODUCT,
            'X-Plex-Version': PLUGIN_VERSION,
            'X-Plex-Device-Name': 'Lampa',
            'X-Plex-Platform': 'Lampa',
            // Plex локализует стандартные названия жанров/стран (список
            // значений фильтра /library/sections/{key}/genre|country) по этому
            // параметру — без него отдаёт то, что есть в таблице по умолчанию
            // (обычно английский), из-за чего часть жанров показывалась не на
            // русском. Весь остальной интерфейс плагина и так жёстко на
            // русском, отдельный переключатель не нужен.
            'X-Plex-Language': 'ru'
        };
    }

    function plexUrl(path, params) {
        var server = getServerUrl();
        var query = buildQueryString(extend({}, plexAuthParams(), params || {}));
        var sep = path.indexOf('?') >= 0 ? '&' : '?';
        return server + path + (query ? sep + query : '');
    }

    function plexRequest(path, params, method) {
        return new Promise(function (resolve, reject) {
            if (!getServerUrl() || !getToken()) { reject(new Error('Plex is not configured')); return; }
            $.ajax({
                url: plexUrl(path, params),
                method: method || 'GET',
                dataType: 'json',
                headers: { Accept: 'application/json' },
                timeout: 15000
            }).done(function (data) {
                resolve((data && data.MediaContainer) || data || {});
            }).fail(function (jqXHR) { reject(jqXHR); });
        });
    }

    function plexTvUrl(path, params) {
        var query = buildQueryString(extend({
            'X-Plex-Client-Identifier': getClientId(),
            'X-Plex-Product': PLEX_PRODUCT
        }, params || {}));
        return PLEX_TV + path + (query ? '?' + query : '');
    }

    function plexTvGet(path, params) {
        return new Promise(function (resolve, reject) {
            $.ajax({
                url: plexTvUrl(path, params),
                method: 'GET',
                dataType: 'json',
                headers: { Accept: 'application/json' },
                timeout: 15000
            }).done(resolve).fail(reject);
        });
    }

    // ---------------------------------------------------------------------
    // Plex API
    // ---------------------------------------------------------------------

    function findTmdbId(item) {
        var found = null;
        (item.Guid || []).forEach(function (g) {
            if (g.id && g.id.indexOf('tmdb://') === 0) found = g.id.slice('tmdb://'.length);
        });
        if (!found && item.guid && item.guid.indexOf('themoviedb://') >= 0) {
            var m = /themoviedb:\/\/(\d+)/.exec(item.guid);
            if (m) found = m[1];
        }
        return found;
    }

    var Api = {
        identity: function () { return plexRequest('/identity'); },

        sections: function () {
            return plexRequest('/library/sections').then(function (mc) {
                return (mc.Directory || []).filter(function (d) { return d.type === 'movie' || d.type === 'show'; });
            });
        },

        list: function (sectionKey, opts) {
            opts = opts || {};
            var path = opts.query
                ? '/library/sections/' + sectionKey + '/search'
                : '/library/sections/' + sectionKey + '/all';
            var params = {
                'X-Plex-Container-Start': opts.start || 0,
                'X-Plex-Container-Size': opts.size || 50,
                includeGuids: 1
            };
            if (opts.query) params.query = opts.query;
            else params.sort = opts.sort || 'titleSort:asc';
            if (opts.genre) params.genre = opts.genre;
            if (opts.country) params.country = opts.country;

            return plexRequest(path, params).then(function (mc) {
                var items = mc.Metadata || [];
                return { items: items, totalSize: mc.totalSize || mc.size || items.length };
            });
        },

        // Значения фильтров, реально встречающиеся в конкретной медиатеке
        // (штатные Plex-эндпоинты, те же, что использует официальный клиент
        // для чипов «Жанр»/«Страна») — ключи у каждой медиатеки свои, поэтому
        // запрашиваются отдельно для каждой выбранной секции.
        genres: function (sectionKey) {
            return plexRequest('/library/sections/' + sectionKey + '/genre').then(function (mc) {
                return (mc.Directory || []).map(function (d) { return { key: d.key, title: d.title }; });
            });
        },

        countries: function (sectionKey) {
            return plexRequest('/library/sections/' + sectionKey + '/country').then(function (mc) {
                return (mc.Directory || []).map(function (d) { return { key: d.key, title: d.title }; });
            });
        },

        metadata: function (ratingKey) {
            return plexRequest('/library/metadata/' + ratingKey, { includeGuids: 1 }).then(function (mc) {
                var m = mc.Metadata && mc.Metadata[0];
                if (!m) throw new Error('Plex metadata not found');
                return m;
            });
        },

        children: function (ratingKey) {
            return plexRequest('/library/metadata/' + ratingKey + '/children').then(function (mc) {
                return mc.Metadata || [];
            });
        },

        // Запускает на самом сервере Plex полное обновление метаданных медиатеки
        // (аналог кнопки «Refresh Metadata» в Plex Web) — помогает, если у
        // конкретного тайтла испорчена/устарела ссылка на постер или другие
        // данные. Выполняется на сервере в фоне, ответ приходит сразу же, само
        // обновление может занять значительное время в зависимости от размера
        // библиотеки — plexRequest тут только подтверждает, что команда принята.
        refreshSection: function (sectionKey) {
            return plexRequest('/library/sections/' + sectionKey + '/refresh', { force: 1 }, 'PUT');
        }
    };

    // ---------------------------------------------------------------------
    // Индекс медиатеки: tmdbId → Plex ratingKey (для кнопки на родной карточке
    // независимо от того, как пользователь до неё дошёл)
    // ---------------------------------------------------------------------

    var _plexTmdbIndex = getStoredTmdbIndex();
    var _tmdbIndexRebuildInProgress = false;

    // Те же правила, что и у «Медиатека Plex»: если пользователь ни разу не
    // открывал «Выбрать медиатеки», getSections() пуст — в этом случае
    // берём все доступные секции сервера, а не пропускаем сборку индекса.
    function resolveActiveSectionKeys() {
        var picked = getSections();
        if (picked.length) return Promise.resolve(picked);
        return Api.sections().then(function (all) { return all.map(function (s) { return s.key; }); });
    }

    function fetchAllSectionItems(sectionKey, query, extra, onPage) {
        var pageSize = 200;

        function step(start) {
            var opts = extend({ start: start, size: pageSize, query: query || '' }, extra || {});
            return Api.list(sectionKey, opts).then(function (data) {
                onPage(data.items);
                var next = start + pageSize;
                if (data.items.length && next < data.totalSize) return step(next);
            });
        }

        return step(0);
    }

    // Полная (без пагинации наружу) выборка одной медиатеки — нужна там, где
    // Plex не даёт единого endpoint для чтения сразу нескольких медиатек
    // (объединённый просмотр «Все», а также фильтры года/жанра/страны —
    // сортируем/фильтруем по году на клиенте) и приходится собирать на
    // стороне клиента.
    function fetchAllItemsFlat(sectionKey, query, extra) {
        var acc = [];
        return fetchAllSectionItems(sectionKey, query, extra, function (items) { acc = acc.concat(items); }).then(function () { return acc; });
    }

    // extraResolver(sectionKey) -> params-объект для Api.list (например
    // {genre: key}) либо null, если у этой медиатеки нет такого значения
    // фильтра вовсе — тогда медиатека целиком пропускается (гарантированно
    // ничего не даст).
    function fetchCombinedItems(sectionKeys, query, extraResolver) {
        var all = [];
        var chain = sectionKeys.reduce(function (prev, key) {
            return prev.then(function () {
                var extra = extraResolver ? extraResolver(key) : {};
                if (!extra) return;
                return fetchAllItemsFlat(key, query, extra).then(function (items) { all = all.concat(items); });
            });
        }, Promise.resolve());
        return chain.then(function () { return all; });
    }

    function rebuildTmdbIndex(opts) {
        opts = opts || {};
        if (_tmdbIndexRebuildInProgress) return Promise.resolve();
        if (!isConfigured()) return Promise.resolve();

        _tmdbIndexRebuildInProgress = true;

        return resolveActiveSectionKeys().then(function (sectionKeys) {
            if (!sectionKeys.length) { _tmdbIndexRebuildInProgress = false; return; }

            var map = {};
            var chain = sectionKeys.reduce(function (prev, sectionKey) {
                return prev.then(function () {
                    return fetchAllSectionItems(sectionKey, '', null, function (items) {
                        items.forEach(function (item) {
                            var tmdbId = findTmdbId(item);
                            if (!tmdbId) return;
                            var method = item.type === 'show' ? 'tv' : 'movie';
                            map[method + ':' + tmdbId] = { ratingKey: item.ratingKey };
                        });
                    });
                });
            }, Promise.resolve());

            return chain.then(function () {
                _plexTmdbIndex = map;
                setStoredTmdbIndex(map);
                if (opts.notify) Lampa.Noty.show('Кэш медиатеки Plex обновлён: ' + Object.keys(map).length + ' наименований');
            }).catch(function () {
                if (opts.notify) Lampa.Noty.show('Не удалось обновить кэш медиатеки Plex');
            }).then(function () {
                _tmdbIndexRebuildInProgress = false;
            });
        }).catch(function () {
            _tmdbIndexRebuildInProgress = false;
            if (opts.notify) Lampa.Noty.show('Не удалось обновить кэш медиатеки Plex');
        });
    }

    // Пересобираем при каждом запуске Lampa (тихо, без уведомлений) — не по таймеру устаревания.
    function autoRebuildTmdbIndexOnStart() {
        if (!isConfigured()) return;
        rebuildTmdbIndex({ notify: false });
    }

    // ---------------------------------------------------------------------
    // Интеграция с LampaTrakt (опционально): статусы просмотра из Trakt
    // вместо Plex в интерфейсе плагина, и обратная запись «просмотрено» в Plex
    // ---------------------------------------------------------------------

    function traktAvailable() {
        return !!(window.Lampa && Lampa.SettingsApi && typeof Lampa.SettingsApi.getComponent === 'function' && Lampa.SettingsApi.getComponent('trakt'));
    }

    function traktStatusEnabled() {
        return traktAvailable() && Lampa.Storage.get('plex_trakt_status_enabled', false) === true;
    }

    function getTraktClientId() { return Lampa.Storage.get('trakt_client_id') || ''; }

    // Повторяет разрешение активного слота мультиаккаунта LampaTrakt
    // (Lampa.Storage 'trakt_accounts' / 'trakt_active_slot'), с откатом на
    // старое плоское хранилище 'trakt_token' для немигрированных установок —
    // тот же порядок, что и в multiAccountGetActiveSlot/GetSlot в LampaTrakt.
    function getTraktActiveToken() {
        try {
            var raw = Lampa.Storage.get('trakt_accounts');
            var slots = Array.isArray(raw) ? raw : JSON.parse(typeof raw === 'string' ? raw : '[]');
            var activeSlot = parseInt(Lampa.Storage.get('trakt_active_slot') || '0', 10) || 0;
            var slot = (slots || []).filter(Boolean).filter(function (s) { return s.slot === activeSlot; })[0];
            if (slot && slot.token) return slot.token;
        } catch (e) {}
        return Lampa.Storage.get('trakt_token') || '';
    }

    function traktConfigured() {
        return traktAvailable() && !!(getTraktClientId() && getTraktActiveToken());
    }

    function traktRequest(path, params) {
        return new Promise(function (resolve, reject) {
            var clientId = getTraktClientId();
            var token = getTraktActiveToken();
            if (!clientId || !token) { reject(new Error('Не найдены client_id/токен Trakt в хранилище Lampa')); return; }
            $.ajax({
                url: 'https://api.trakt.tv' + path + (params ? '?' + buildQueryString(params) : ''),
                method: 'GET',
                dataType: 'json',
                headers: {
                    'trakt-api-version': '2',
                    'trakt-api-key': clientId,
                    'Authorization': 'Bearer ' + token
                },
                timeout: 20000
            }).done(resolve).fail(reject);
        });
    }

    function describeAjaxError(e) {
        if (!e) return 'неизвестная ошибка';
        if (e.status) return 'HTTP ' + e.status + (e.statusText ? ' ' + e.statusText : '');
        return e.message || String(e);
    }

    // Trakt пагинирует /sync/watched/* по 100 элементов на страницу (проверено:
    // ровно 100/100 в ответе; LampaTrakt столкнулся с тем же, их changelog v3.2.39).
    // Дочитываем все страницы, иначе всё, что за пределами первой сотни, читается
    // как «не просмотрено». Стоп: короткая страница / пусто / предохранитель 50 стр.
    function traktGetAllPages(path, extraParams) {
        var pageSize = 100;
        var all = [];
        function step(page) {
            var params = extend({ page: page, limit: pageSize }, extraParams || {});
            return traktRequest(path, params).then(function (data) {
                var arr = Array.isArray(data) ? data : [];
                all = all.concat(arr);
                if (arr.length >= pageSize && page < 50) return step(page + 1);
                return all;
            });
        }
        return step(1);
    }

    var TRAKT_WATCHED_CACHE_MS = 10 * 60 * 1000;
    var _traktWatchedIndex = null;
    var _traktWatchedIndexAt = 0;
    var _traktWatchedIndexPromise = null;
    // Диагностика последней попытки — показывается в настройках, чтобы не
    // гадать вслепую, если статусы Trakt не подтягиваются (истёкший токен,
    // не тот client_id и т.п.), а не молча падать обратно на Plex без следа.
    var _traktLastFetch = { at: 0, ok: null, error: '' };

    // Диагностика последней попытки повесить бейджи LampaTrakt на карточку
    // медиатеки (см. onInstance в makePlexLibraryComponent) — показывается в
    // настройках («Проверить бейджи LampaTrakt на медиатеке»).
    var _plexBadgesLastAttempt = null;

    // Карта 'movie:<tmdbId>' -> true, 'tv:<tmdbId>' -> {completed, traktId, episodes:{...}}.
    // Разбивка по сериям у Trakt в /sync/watched/shows нестабильна (LampaTrakt
    // документирует, что Trakt перестал её отдавать, v3.2.38) — поэтому "completed"
    // считается устойчиво по plays >= aired_episodes, а точный per-episode статус
    // берётся отдельно из /shows/{traktId}/progress/watched (getTraktShowEpisodeSet).
    function getTraktWatchedIndex() {
        if (_traktWatchedIndex && (Date.now() - _traktWatchedIndexAt) < TRAKT_WATCHED_CACHE_MS) {
            return Promise.resolve(_traktWatchedIndex);
        }
        if (_traktWatchedIndexPromise) return _traktWatchedIndexPromise;

        _traktWatchedIndexPromise = Promise.all([
            traktGetAllPages('/sync/watched/movies', { extended: 'full' }),
            traktGetAllPages('/sync/watched/shows', { extended: 'full' })
        ]).then(function (results) {
            var map = {};
            (results[0] || []).forEach(function (m) {
                var tmdb = m.movie && m.movie.ids && m.movie.ids.tmdb;
                if (tmdb) map['movie:' + tmdb] = true;
            });
            (results[1] || []).forEach(function (s) {
                var tmdb = s.show && s.show.ids && s.show.ids.tmdb;
                if (!tmdb) return;
                var aired = Number((s.show && s.show.aired_episodes) || 0);
                var plays = Number(s.plays || 0);
                map['tv:' + tmdb] = {
                    completed: aired > 0 && plays >= aired,
                    traktId: (s.show && s.show.ids && s.show.ids.trakt) || null
                };
            });
            _traktWatchedIndex = map;
            _traktWatchedIndexAt = Date.now();
            _traktWatchedIndexPromise = null;
            _traktLastFetch = { at: Date.now(), ok: true, error: '', movies: (results[0] || []).length, shows: (results[1] || []).length };
            return map;
        }).catch(function (e) {
            _traktLastFetch = { at: Date.now(), ok: false, error: describeAjaxError(e) };
            _traktWatchedIndexPromise = null;
            throw e;
        });

        return _traktWatchedIndexPromise;
    }

    function traktMovieWatched(index, tmdbId) { return !!(index && tmdbId && index['movie:' + tmdbId]); }
    function traktShowStatus(index, tmdbId) { return (index && tmdbId) ? (index['tv:' + tmdbId] || null) : null; }

    // Точный per-episode статус для конкретного сериала: /sync/watched/shows не
    // отдаёт разбивку по сериям, поэтому берём её из /shows/{traktId}/progress/watched
    // (там есть seasons[].episodes[].completed). Резолвим tmdbId → traktId сначала
    // из уже собранного watched-индекса, иначе через /search/tmdb/{id}?type=show.
    // Результат — множество ключей 'season:episode'. Кэш в памяти, TTL как у индекса.
    var _traktEpisodeSetCache = {};
    function getTraktShowEpisodeSet(tmdbId) {
        if (!tmdbId) return Promise.resolve(null);
        var cached = _traktEpisodeSetCache[tmdbId];
        if (cached && (Date.now() - cached.at) < TRAKT_WATCHED_CACHE_MS) return Promise.resolve(cached.set);

        function resolveTraktId() {
            return getTraktWatchedIndex().then(function (index) {
                var s = traktShowStatus(index, tmdbId);
                if (s && s.traktId) return s.traktId;
                return traktRequest('/search/tmdb/' + tmdbId, { type: 'show' }).then(function (res) {
                    var first = Array.isArray(res) ? res[0] : null;
                    return (first && first.show && first.show.ids && first.show.ids.trakt) || null;
                });
            });
        }

        return resolveTraktId().then(function (traktId) {
            if (!traktId) return null;
            return traktRequest('/shows/' + traktId + '/progress/watched', { hidden: false, specials: false, count_specials: false }).then(function (prog) {
                var set = {};
                ((prog && prog.seasons) || []).forEach(function (season) {
                    (season.episodes || []).forEach(function (ep) {
                        if (ep.completed) set[season.number + ':' + ep.number] = true;
                    });
                });
                _traktEpisodeSetCache[tmdbId] = { at: Date.now(), set: set };
                return set;
            });
        }).catch(function () { return null; });
    }

    // Текст статуса для карточки/модалки — из Trakt, если включено и доступно,
    // иначе из собственных полей Plex (viewCount / leafCount+viewedLeafCount).
    function plexStatusLine(meta) {
        if (meta.type === 'movie') return meta.viewCount > 0 ? 'Просмотрено' : 'Не просмотрено';
        var total = Number(meta.leafCount || 0);
        var watched = Number(meta.viewedLeafCount || 0);
        if (!total) return '';
        if (watched >= total) return 'Просмотрено полностью';
        return watched ? ('Просмотрено серий: ' + watched + ' из ' + total) : 'Не просмотрено';
    }

    function statusLineForMeta(meta, tmdbId) {
        if (traktStatusEnabled() && tmdbId) {
            return getTraktWatchedIndex().then(function (index) {
                if (meta.type === 'movie') return traktMovieWatched(index, tmdbId) ? 'Просмотрено' : 'Не просмотрено';
                var s = traktShowStatus(index, tmdbId);
                if (!s) return 'Не просмотрено';
                if (s.completed) return 'Просмотрено полностью';
                // Наличие сериала в /sync/watched/shows означает, что просмотрена
                // хотя бы одна серия; точное число берём из progress-эндпоинта,
                // т.к. per-episode разбивки в watched-индексе обычно нет.
                return getTraktShowEpisodeSet(tmdbId).then(function (set) {
                    var count = set ? Object.keys(set).length : 0;
                    return count ? ('Просмотрено серий: ' + count) : 'Смотрю';
                });
            }).catch(function () { return plexStatusLine(meta); });
        }
        return Promise.resolve(plexStatusLine(meta));
    }

    // Массовая односторонняя синхронизация Trakt → Plex: отмечает в Plex как
    // просмотренные фильмы и ПОЛНОСТЬЮ просмотренные сериалы (все серии) из
    // истории Trakt. Частично просмотренные сериалы намеренно пропускаются —
    // без стабильной поэпизодной разбивки от Trakt риск ошибиться слишком велик.
    // Сопоставление — через уже собранный _plexTmdbIndex, запускается только
    // вручную (кнопка в настройках с подтверждением), не автоматически.
    function syncTraktStatusesToPlex() {
        if (!traktConfigured()) { Lampa.Noty.show('Сначала войдите в Trakt через LampaTrakt'); return Promise.resolve(); }
        if (!isConfigured()) { Lampa.Noty.show('Сначала настройте подключение к Plex'); return Promise.resolve(); }

        Lampa.Noty.show('Синхронизация статусов Trakt → Plex начата…');

        function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
        function markRatingKey(ratingKey) {
            return plexRequest('/:/scrobble', { key: ratingKey, identifier: 'com.plexapp.plugins.library' }).catch(function () {});
        }

        return getTraktWatchedIndex().then(function (index) {
            var movieKeys = Object.keys(index).filter(function (k) { return k.indexOf('movie:') === 0 && index[k]; });
            var showKeys = Object.keys(index).filter(function (k) { return k.indexOf('tv:') === 0 && index[k] && index[k].completed; });

            var markedMovies = 0, markedEpisodes = 0, skipped = 0;

            var processMovies = movieKeys.reduce(function (prev, key) {
                return prev.then(function () {
                    var match = _plexTmdbIndex[key];
                    if (!match) { skipped++; return; }
                    return markRatingKey(match.ratingKey).then(function () { markedMovies++; }).then(function () { return delay(150); });
                });
            }, Promise.resolve());

            return processMovies.then(function () {
                return showKeys.reduce(function (prev, key) {
                    return prev.then(function () {
                        var match = _plexTmdbIndex[key];
                        if (!match) { skipped++; return; }
                        return Api.children(match.ratingKey).then(function (seasons) {
                            var realSeasons = seasons.filter(function (s) { return s.type === 'season'; });
                            return realSeasons.reduce(function (p, season) {
                                return p.then(function () {
                                    return Api.children(season.ratingKey).then(function (episodes) {
                                        var realEpisodes = episodes.filter(function (e) { return e.type === 'episode'; });
                                        return realEpisodes.reduce(function (pe, ep) {
                                            return pe.then(function () {
                                                return markRatingKey(ep.ratingKey).then(function () { markedEpisodes++; }).then(function () { return delay(150); });
                                            });
                                        }, Promise.resolve());
                                    });
                                });
                            }, Promise.resolve());
                        }).catch(function () { skipped++; });
                    });
                }, Promise.resolve());
            }).then(function () {
                Lampa.Noty.show('Готово: отмечено в Plex — фильмов ' + markedMovies + ', серий ' + markedEpisodes +
                    (skipped ? (', пропущено (нет в Plex): ' + skipped) : ''));
            });
        }).catch(function () {
            Lampa.Noty.show('Не удалось синхронизировать статусы Trakt → Plex');
        });
    }

    function confirmTraktSyncToPlex() {
        if (!traktConfigured()) { Lampa.Noty.show('Сначала войдите в Trakt через LampaTrakt'); return; }
        Lampa.Select.show({
            title: 'Синхронизировать статусы в Plex?',
            items: [
                { title: 'Да, начать', action: 'confirm' },
                { title: 'Отмена', action: 'cancel' }
            ],
            onSelect: function (a) {
                Lampa.Controller.toggle('settings_component');
                if (a.action === 'confirm') syncTraktStatusesToPlex();
            },
            onBack: function () { Lampa.Controller.toggle('settings_component'); }
        });
    }

    // Просит сам Plex Media Server заново обновить метаданные выбранных
    // медиатек (постеры, описания, сопоставления) — по просьбе пользователя,
    // столкнувшегося с испорченной ссылкой на постер у одного тайтла. Тяжёлая
    // операция на стороне сервера (полное пересопоставление с локальными
    // и онлайн-агентами), поэтому — подтверждение перед запуском, как и у
    // синхронизации статусов Trakt → Plex.
    function refreshPlexMetadata() {
        resolveActiveSectionKeys().then(function (sectionKeys) {
            if (!sectionKeys.length) { Lampa.Noty.show('Не выбраны медиатеки Plex в настройках'); return; }
            return sectionKeys.reduce(function (prev, key) {
                return prev.then(function () { return Api.refreshSection(key).catch(function () {}); });
            }, Promise.resolve()).then(function () {
                Lampa.Noty.show('Обновление метаданных запущено на сервере Plex — это может занять время в фоне');
            });
        }).catch(function () {
            Lampa.Noty.show('Не удалось запустить обновление метаданных в Plex');
        });
    }

    function confirmRefreshPlexMetadata() {
        if (!isConfigured()) { Lampa.Noty.show('Сначала настройте подключение к Plex'); return; }
        Lampa.Select.show({
            title: 'Обновить метаданные в Plex?',
            items: [
                { title: 'Да, начать', action: 'confirm' },
                { title: 'Отмена', action: 'cancel' }
            ],
            onSelect: function (a) {
                Lampa.Controller.toggle('settings_component');
                if (a.action === 'confirm') refreshPlexMetadata();
            },
            onBack: function () { Lampa.Controller.toggle('settings_component'); }
        });
    }

    // ── Отправка просмотра из Plex в Trakt ────────────────────────────────
    // Токен обновляет сам LampaTrakt (пишет свежий в Storage), мы читаем текущий.

    function traktScrobbleEnabled() {
        return traktAvailable() && Lampa.Storage.get('plex_trakt_scrobble', false) === true;
    }

    // Порог «досмотрено» берём из настройки самого LampaTrakt (trakt_min_progress),
    // чтобы Plex и Trakt отмечали просмотренным по одному правилу. Fallback 90.
    function traktMinProgress() {
        var value = parseInt(Lampa.Storage.field('trakt_min_progress'), 10);
        if (isNaN(value)) value = 90;
        if (value < 1) value = 1;
        if (value > 100) value = 100;
        return value;
    }

    function traktPost(path, body) {
        return new Promise(function (resolve, reject) {
            var clientId = getTraktClientId();
            var token = getTraktActiveToken();
            if (!clientId || !token) { reject(new Error('Trakt не настроен')); return; }
            $.ajax({
                url: 'https://api.trakt.tv' + path,
                method: 'POST',
                data: JSON.stringify(body || {}),
                contentType: 'application/json',
                dataType: 'json',
                headers: {
                    'trakt-api-version': '2',
                    'trakt-api-key': clientId,
                    'Authorization': 'Bearer ' + token
                },
                timeout: 20000
            }).done(resolve).fail(reject);
        });
    }

    // trakt identity: { type:'movie', tmdb } | { type:'episode', tmdb:<show>, season, number }
    function buildTraktHistoryPayload(trakt, watchedAt) {
        var tmdb = Number(trakt && trakt.tmdb);
        if (!tmdb) return null;
        if (trakt.type === 'movie') {
            return { movies: [{ ids: { tmdb: tmdb }, watched_at: watchedAt }] };
        }
        if (trakt.type === 'episode' && trakt.season != null && trakt.number != null) {
            return { shows: [{ ids: { tmdb: tmdb }, seasons: [{ number: Number(trakt.season), episodes: [{ number: Number(trakt.number), watched_at: watchedAt }] }] }] };
        }
        return null;
    }

    function buildTraktScrobbleBody(trakt, progress) {
        var tmdb = Number(trakt && trakt.tmdb);
        if (!tmdb) return null;
        if (trakt.type === 'movie') return { movie: { ids: { tmdb: tmdb } }, progress: progress };
        if (trakt.type === 'episode' && trakt.season != null && trakt.number != null) {
            return { show: { ids: { tmdb: tmdb } }, episode: { season: Number(trakt.season), number: Number(trakt.number) }, progress: progress };
        }
        return null;
    }

    // После отметки в Trakt сбрасываем кэши статусов, чтобы интерфейс плагина
    // (который читает из Trakt) сразу показал новый статус.
    function invalidateTraktCaches() {
        _traktWatchedIndex = null;
        _traktWatchedIndexAt = 0;
        _traktEpisodeSetCache = {};
    }

    // Очередь повторной отправки: если POST не удался (401 от протухшего токена,
    // нет сети), payload /sync/history сохраняется и до-отправляется при старте —
    // пересматривать серию не нужно.
    var TRAKT_QUEUE_KEY = 'plex_trakt_scrobble_queue';
    function getTraktQueue() {
        var v = Lampa.Storage.get(TRAKT_QUEUE_KEY, []);
        return Array.isArray(v) ? v : [];
    }
    function setTraktQueue(arr) { Lampa.Storage.set(TRAKT_QUEUE_KEY, JSON.stringify(arr || [])); }
    function enqueueTraktHistory(payload) {
        var q = getTraktQueue();
        q.push(payload);
        if (q.length > 200) q = q.slice(q.length - 200);
        setTraktQueue(q);
    }
    function flushTraktQueue() {
        if (!traktScrobbleEnabled() || !traktConfigured()) return;
        var q = getTraktQueue();
        if (!q.length) return;
        setTraktQueue([]); // забираем в работу; неуспешные вернём обратно
        var failed = [];
        q.reduce(function (prev, payload) {
            return prev.then(function () {
                return traktPost('/sync/history', payload).catch(function () { failed.push(payload); });
            });
        }, Promise.resolve()).then(function () {
            if (failed.length) setTraktQueue(getTraktQueue().concat(failed));
            else invalidateTraktCaches();
        });
    }

    // Вызывается при закрытии плеера: досмотрено до порога → отметка «просмотрено»
    // в Trakt (/sync/history, с очередью при сбое); ниже порога, но с прогрессом →
    // /scrobble/pause (best-effort, для resume в Trakt).
    function reportPlaybackToTrakt(trakt, timeSec, durationSec) {
        if (!trakt || !traktScrobbleEnabled() || !traktConfigured()) return;
        var percent = durationSec ? Math.min(100, Math.round(timeSec / durationSec * 100)) : 0;
        if (percent >= traktMinProgress()) {
            var payload = buildTraktHistoryPayload(trakt, new Date().toISOString());
            if (!payload) return;
            traktPost('/sync/history', payload).then(function () {
                invalidateTraktCaches();
            }).catch(function () { enqueueTraktHistory(payload); });
        } else if (percent >= 2 && timeSec > 30) {
            var body = buildTraktScrobbleBody(trakt, percent);
            if (body) traktPost('/scrobble/pause', body).catch(function () {});
        }
    }

    // ---------------------------------------------------------------------
    // Вход через Plex.tv (PIN / QR) + автообнаружение серверов
    // ---------------------------------------------------------------------

    var _pinPollTimer = null;

    function startPlexTvLogin() {
        $.ajax({
            url: PLEX_TV + '/api/v2/pins',
            method: 'POST',
            dataType: 'json',
            headers: { Accept: 'application/json' },
            data: { strong: true, 'X-Plex-Client-Identifier': getClientId(), 'X-Plex-Product': PLEX_PRODUCT }
        }).done(function (pin) {
            if (!pin || !pin.id || !pin.code) { Lampa.Noty.show('Ошибка авторизации Plex.tv'); return; }
            showPinModal(pin);
        }).fail(function () { Lampa.Noty.show('Ошибка авторизации Plex.tv'); });
    }

    function showPinModal(pin) {
        var authUrl = 'https://app.plex.tv/auth#?clientID=' + encodeURIComponent(getClientId()) +
            '&code=' + encodeURIComponent(pin.code) +
            '&context%5Bdevice%5D%5Bproduct%5D=' + encodeURIComponent(PLEX_PRODUCT);
        var qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=420x420&data=' + encodeURIComponent(authUrl);

        var html = $(
            '<div class="about plex-device-auth">' +
            '<div class="plex-device-auth__qr"><a href="' + authUrl + '" target="_blank" rel="noopener noreferrer">' +
            '<img src="' + qrUrl + '" alt="QR"></a></div>' +
            '<div class="about__text">Откройте ссылку на телефоне/компьютере и введите код:</div>' +
            '<div class="about__text plex-device-auth__code"><strong>' + escapeHtml(pin.code) + '</strong></div>' +
            '<div class="modal__button selector plex-check-now">Проверить сейчас</div>' +
            '</div>'
        );

        try { window.open(authUrl, '_blank'); } catch (e) {}

        Lampa.Modal.open({
            title: 'Вход через Plex.tv',
            html: html,
            size: Lampa.Platform.screen('mobile') ? 'medium' : 'small',
            select: html.find('.plex-check-now')[0],
            onSelect: function () { checkPinNow(pin.id); },
            onBack: function () {
                clearTimeout(_pinPollTimer);
                Lampa.Modal.close();
                Lampa.Controller.toggle('settings_component');
            }
        });

        pollPin(pin.id, 0);
    }

    function pollPin(pinId, attempt) {
        if (attempt > 150) return; // ~10 минут при интервале 4с
        plexTvGet('/api/v2/pins/' + pinId, {}).then(function (data) {
            if (data && data.authToken) onPlexTvLoginSuccess(data.authToken);
            else _pinPollTimer = setTimeout(function () { pollPin(pinId, attempt + 1); }, 4000);
        }).catch(function () {
            _pinPollTimer = setTimeout(function () { pollPin(pinId, attempt + 1); }, 4000);
        });
    }

    function checkPinNow(pinId) {
        plexTvGet('/api/v2/pins/' + pinId, {}).then(function (data) {
            if (data && data.authToken) onPlexTvLoginSuccess(data.authToken);
            else Lampa.Noty.show('Ещё не подтверждено — откройте ссылку и введите код');
        }).catch(function () { Lampa.Noty.show('Ещё не подтверждено'); });
    }

    function onPlexTvLoginSuccess(authToken) {
        clearTimeout(_pinPollTimer);
        Lampa.Modal.close();
        discoverServers(authToken).then(function (servers) {
            if (!servers.length) { Lampa.Noty.show('У аккаунта Plex не найдено серверов'); return; }
            if (servers.length === 1) return applyServer(authToken, servers[0]);
            Lampa.Select.show({
                title: 'Выберите сервер Plex',
                items: servers.map(function (s) { return { title: s.name, s: s }; }),
                onSelect: function (a) { applyServer(authToken, a.s); },
                onBack: function () { Lampa.Controller.toggle('settings_component'); }
            });
        }).catch(function () { Lampa.Noty.show('Не удалось получить список серверов Plex'); });
    }

    function discoverServers(authToken) {
        return plexTvGet('/api/v2/resources', { includeHttps: 1, 'X-Plex-Token': authToken }).then(function (list) {
            var servers = [];
            (Array.isArray(list) ? list : []).forEach(function (d) {
                if (!d.provides || d.provides.indexOf('server') < 0) return;
                var conns = d.connections || [];
                var local = conns.filter(function (c) { return c.local; });
                var chosen = local[0] || conns[0];
                if (chosen) servers.push({ name: d.name, uri: chosen.uri });
            });
            return servers;
        });
    }

    function applyServer(authToken, server) {
        setToken(authToken);
        setServerUrl(server.uri);
        Lampa.Noty.show('Plex подключён: ' + server.name);
        Lampa.Settings.update();
        Lampa.Controller.toggle('settings_component');
    }

    function testConnection() {
        if (!getServerUrl() || !getToken()) { Lampa.Noty.show('Укажите адрес сервера и токен'); return; }
        Api.identity().then(function () {
            Lampa.Noty.show('Подключение к Plex успешно');
        }).catch(function () {
            Lampa.Noty.show('Не удалось подключиться к Plex — проверьте адрес и токен');
        });
    }

    function arraysEqualUnordered(a, b) {
        if (a.length !== b.length) return false;
        var sa = a.slice().sort();
        var sb = b.slice().sort();
        for (var i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
        return true;
    }

    function pickSections() {
        if (!isConfigured()) { Lampa.Noty.show('Сначала укажите адрес сервера и токен'); return; }
        Api.sections().then(function (list) {
            var selected = getSections();
            if (!selected.length) selected = list.map(function (s) { return s.key; });
            var initialSelected = selected.slice();

            function finish() {
                Lampa.Controller.toggle('settings_component');
                // Пересобираем индекс, только если набор реально изменился —
                // иначе просто открыли/закрыли экран без обновления кэша и без уведомления.
                if (!arraysEqualUnordered(selected, initialSelected)) {
                    setSections(selected);
                    rebuildTmdbIndex({ notify: true });
                }
            }

            function render() {
                var items = list.map(function (s) {
                    var checked = selected.indexOf(s.key) >= 0;
                    return { title: (checked ? '✓ ' : '') + s.title, subtitle: s.type === 'show' ? 'Сериалы' : 'Фильмы', key: s.key };
                });
                items.push({ title: 'Готово', done: true });
                Lampa.Select.show({
                    title: 'Медиатеки Plex',
                    items: items,
                    onSelect: function (a) {
                        if (a.done) { finish(); return; }
                        var idx = selected.indexOf(a.key);
                        if (idx >= 0) selected.splice(idx, 1); else selected.push(a.key);
                        render();
                    },
                    onBack: function () { finish(); }
                });
            }
            render();
        }).catch(function () { Lampa.Noty.show('Не удалось получить список медиатек Plex'); });
    }

    function resetSettings() {
        restorePlexPriorityIfNeeded();
        ['plex_server_url', 'plex_token', 'plex_sections_selected', 'plex_sync_enabled', 'plex_tmdb_index', 'plex_tmdb_index_updated_at', 'plex_prev_btn_priority', 'plex_trakt_status_enabled', 'plex_trakt_scrobble', 'plex_trakt_scrobble_queue'].forEach(function (k) {
            Lampa.Storage.set(k, '');
        });
        _plexTmdbIndex = {};
        Lampa.Noty.show('Настройки Plex сброшены');
        Lampa.Settings.update();
    }

    // ---------------------------------------------------------------------
    // Настройки плагина
    // ---------------------------------------------------------------------

    function mdToHtml(md) {
        function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
        function inl(s) {
            return esc(s)
                .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
                .replace(/\*(.+?)\*/g, '<i>$1</i>')
                .replace(/__(.+?)__/g, '<b>$1</b>')
                .replace(/_([^_]+)_/g, '<i>$1</i>')
                .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,.12);padding:.1em .35em;border-radius:.25em;font-size:.9em">$1</code>')
                .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#e5a00d;text-decoration:none">$1</a>');
        }
        var lines = md.split('\n');
        var out = [], inFence = false, inList = false, listTag = '', inTable = false, inP = false;
        function closeP() { if (inP) { out.push('</p>'); inP = false; } }
        function closeList() { if (inList) { out.push('</' + listTag + '>'); inList = false; listTag = ''; } }
        function closeTable() { if (inTable) { out.push('</tbody></table>'); inTable = false; } }
        function closeBlock() { closeList(); closeTable(); closeP(); }
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (/^```/.test(line)) {
                closeBlock();
                if (inFence) { out.push('</code></pre>'); inFence = false; }
                else { out.push('<pre style="background:rgba(255,255,255,.08);padding:.6em .9em;border-radius:.4em;overflow:auto;margin:.5em 0;white-space:pre-wrap"><code style="font-size:.86em;font-family:monospace">'); inFence = true; }
                continue;
            }
            if (inFence) { out.push(esc(line) + '\n'); continue; }
            if (!line.trim()) { closeBlock(); continue; }
            var hm = line.match(/^(#{1,3}) (.+)/);
            if (hm) {
                closeBlock();
                var lvl = hm[1].length, sizes = ['1.5em', '1.25em', '1.1em'], mts = ['1em', '.8em', '.6em'];
                out.push('<h' + lvl + ' style="margin:' + mts[lvl - 1] + ' 0 .3em;font-size:' + sizes[lvl - 1] + ';line-height:1.3">' + inl(hm[2]) + '</h' + lvl + '>');
                continue;
            }
            if (/^[-*_]{3,}$/.test(line.trim())) { closeBlock(); out.push('<hr style="border:none;border-top:1px solid rgba(255,255,255,.2);margin:.8em 0">'); continue; }
            if (/^\|/.test(line)) {
                closeP();
                if (/^\|[\s|:-]+\|$/.test(line.trim())) continue;
                var cells = line.split('|').slice(1, -1).map(function (c) { return c.trim(); });
                if (!inTable) {
                    closeList();
                    out.push('<table style="border-collapse:collapse;width:100%;margin:.5em 0;font-size:.95em">');
                    out.push('<thead><tr>' + cells.map(function (c) { return '<th style="border:1px solid rgba(255,255,255,.2);padding:.35em .6em;text-align:left;background:rgba(255,255,255,.1);font-weight:700">' + inl(c) + '</th>'; }).join('') + '</tr></thead><tbody>');
                    inTable = true;
                } else {
                    out.push('<tr>' + cells.map(function (c) { return '<td style="border:1px solid rgba(255,255,255,.15);padding:.35em .6em">' + inl(c) + '</td>'; }).join('') + '</tr>');
                }
                continue;
            }
            var ulm = line.match(/^[-*+] (.+)/), olm = line.match(/^\d+\. (.+)/);
            if (ulm || olm) {
                closeTable(); closeP();
                var tag = ulm ? 'ul' : 'ol';
                if (!inList) { out.push('<' + tag + ' style="margin:.3em 0;padding-left:1.5em">'); inList = true; listTag = tag; }
                out.push('<li style="margin:.25em 0">' + inl((ulm || olm)[1]) + '</li>');
                continue;
            }
            var bq = line.match(/^> (.+)/);
            if (bq) { closeBlock(); out.push('<blockquote style="border-left:3px solid rgba(255,255,255,.35);margin:.4em 0;padding:.2em .7em;opacity:.85">' + inl(bq[1]) + '</blockquote>'); continue; }
            closeList(); closeTable();
            if (!inP) { out.push('<p style="margin:.5em 0">'); inP = true; } else out.push('<br>');
            out.push(inl(line));
        }
        closeBlock();
        return out.join('');
    }

    function openReadme() {
        var body = $('<div style="font-size:1.2em;line-height:1.5;font-weight:300"></div>');
        body.html('<div style="text-align:center;padding:3em;opacity:.6">Загрузка…</div>');
        Lampa.Modal.open({
            title: 'Lampa-Plex v' + PLUGIN_VERSION,
            html: body,
            size: 'large',
            onBack: function () { Lampa.Modal.close(); Lampa.Controller.toggle('settings_component'); }
        });
        $.ajax({
            url: 'https://raw.githubusercontent.com/KZuev/Lampa-Plex/main/README.md',
            dataType: 'text',
            timeout: 10000,
            success: function (md) {
                body.html(mdToHtml(md));
            },
            error: function () {
                body.html('<div style="padding:2em;text-align:center;opacity:.7">Не удалось загрузить README.<br>Проверьте соединение с интернетом.</div>');
            }
        });
    }

    function sectionHeader(name, title) {
        Lampa.SettingsApi.addParam({
            component: 'plex',
            param: { name: name, type: 'static' },
            field: { name: '' },
            onRender: function (item) {
                item.empty();
                item.append('<div class="settings-param__name" style="opacity:.55;font-weight:700">' + title + '</div>');
            }
        });
    }

    function initSettings() {
        Lampa.SettingsApi.addComponent({ component: 'plex', name: 'Plex', icon: ICON_SETTINGS });

        Lampa.SettingsApi.addParam({
            component: 'plex',
            param: { name: 'plex_about', type: 'button' },
            field: { name: 'Lampa-Plex v' + PLUGIN_VERSION },
            onRender: function (item) { item.find('.settings-param__value').remove(); },
            onChange: function () { openReadme(); }
        });

        sectionHeader('plex_connection_section', 'Подключение к серверу');

        Lampa.SettingsApi.addParam({
            component: 'plex',
            param: { name: 'plex_server_url', type: 'button' },
            field: { name: 'Адрес сервера' },
            onRender: function (item) {
                item.find('.plex-field-status').remove();
                item.append('<div class="settings-param__value plex-field-status" style="font-size:.85em;opacity:.65">' +
                    escapeHtml(getServerUrl() || 'не указан') + '</div>');
            },
            onChange: function () {
                Lampa.Input.edit({
                    title: 'Адрес сервера (например http://192.168.1.50:32400)',
                    value: getServerUrl(),
                    free: true, nosave: true, nomic: true
                }, function (val) { setServerUrl(val); Lampa.Settings.update(); });
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'plex',
            param: { name: 'plex_token', type: 'button' },
            field: { name: 'Токен (X-Plex-Token)' },
            onRender: function (item) {
                item.find('.plex-field-status').remove();
                item.append('<div class="settings-param__value plex-field-status" style="font-size:.85em;opacity:.65">' +
                    (getToken() ? 'указан' : 'не указан') + '</div>');
            },
            onChange: function () {
                Lampa.Input.edit({
                    title: 'X-Plex-Token',
                    value: getToken(),
                    free: true, nosave: true, nomic: true
                }, function (val) { setToken(val); Lampa.Settings.update(); });
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'plex',
            param: { name: 'plex_login_plextv', type: 'button' },
            field: { name: 'Войти через Plex.tv', description: 'Вход по коду, сервер определится автоматически' },
            onChange: function () { startPlexTvLogin(); }
        });

        Lampa.SettingsApi.addParam({
            component: 'plex',
            param: { name: 'plex_test_connection', type: 'button' },
            field: { name: 'Проверить соединение' },
            onChange: function () { testConnection(); }
        });

        sectionHeader('plex_libraries_section', 'Медиатеки');

        Lampa.SettingsApi.addParam({
            component: 'plex',
            param: { name: 'plex_pick_sections', type: 'button' },
            field: { name: 'Выбрать медиатеки', description: 'Какие разделы Plex показывать в «Медиатеке Plex»' },
            onChange: function () { pickSections(); }
        });

        Lampa.SettingsApi.addParam({
            component: 'plex',
            param: { name: 'plex_default_sort', type: 'button' },
            field: { name: 'Сортировка по умолчанию', description: 'С какой сортировки открывается «Plex» в левом меню. Повторный выбор того же пункта переключает направление — так же, как кнопка «Сортировка» внутри самого раздела.' },
            onRender: function (item) {
                item.find('.plex-field-status').remove();
                item.append('<div class="settings-param__value plex-field-status" style="font-size:.85em;opacity:.65">' + escapeHtml(sortLabelWithArrow(getDefaultSort())) + '</div>');
            },
            onChange: function () { openDefaultSortPicker(); }
        });

        Lampa.SettingsApi.addParam({
            component: 'plex',
            param: { name: 'plex_rebuild_index', type: 'button' },
            field: { name: 'Обновить кэш медиатеки', description: 'Нужен, чтобы кнопка «Смотреть из Plex» показывалась на любой карточке фильма/сериала, а не только после захода в «Медиатеку Plex»' },
            onRender: function (item) {
                item.find('.plex-field-status').remove();
                var updatedAt = getTmdbIndexUpdatedAt();
                var count = Object.keys(_plexTmdbIndex).length;
                var status = updatedAt
                    ? ('обновлено ' + new Date(updatedAt).toLocaleString() + ', сопоставлено: ' + count)
                    : 'ещё не собирался';
                item.append('<div class="settings-param__value plex-field-status" style="font-size:.85em;opacity:.65">' + escapeHtml(status) + '</div>');
            },
            onChange: function () {
                Lampa.Noty.show('Обновляю кэш медиатеки Plex…');
                rebuildTmdbIndex({ notify: true }).then(function () { Lampa.Settings.update(); });
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'plex',
            param: { name: 'plex_refresh_metadata', type: 'button' },
            field: { name: 'Обновить метаданные в Plex', description: 'Просит сам сервер Plex заново обновить метаданные выбранных медиатек (аналог кнопки «Refresh Metadata» в Plex) — помогает, если постер или другие данные конкретного тайтла испорчены или устарели. Выполняется на сервере в фоне, может занять время.' },
            onChange: function () { confirmRefreshPlexMetadata(); }
        });

        Lampa.SettingsApi.addParam({
            component: 'plex',
            param: { name: 'plex_poster_source_tmdb', type: 'trigger', default: false },
            field: { name: 'Обложки из TMDB', description: 'Показывать в «Plex» постеры с TMDB вместо постеров из самого Plex — если в Plex обложки другие (свои/нестандартные), в Lampa всё будет выглядеть единообразно, как в остальных каталогах. Требует доп. запрос к TMDB на каждую карточку — может немного замедлить загрузку сетки.' }
        });

        sectionHeader('plex_playback_section', 'Воспроизведение');

        Lampa.SettingsApi.addParam({
            component: 'plex',
            param: { name: 'plex_sync_enabled', type: 'trigger', default: true },
            field: { name: 'Отслеживать просмотр в Plex', description: 'Отправлять позицию и статус просмотра на сервер Plex (Direct Play; транскодирование не поддерживается)' }
        });

        Lampa.SettingsApi.addParam({
            component: 'plex',
            param: { name: 'plex_trakt_status_enabled', type: 'trigger', default: false },
            field: { name: 'Статусы Trakt.TV', description: 'Просмотрено/не просмотрено и прогресс в интерфейсе плагина — из активного аккаунта Trakt (LampaTrakt), а не из Plex' },
            onRender: function (item) { if (traktAvailable()) item.show(); else item.hide(); }
        });

        Lampa.SettingsApi.addParam({
            component: 'plex',
            param: { name: 'plex_trakt_scrobble', type: 'trigger', default: false },
            field: { name: 'Отправлять просмотр в Trakt', description: 'После просмотра через Plex отмечать фильм/серию просмотренными в активном аккаунте Trakt (порог досмотра берётся из настройки LampaTrakt «Порог просмотра»; ниже порога — сохраняется позиция). При сбое отправка повторится при следующем запуске — пересматривать не нужно.' },
            onRender: function (item) { if (traktAvailable()) item.show(); else item.hide(); }
        });

        Lampa.SettingsApi.addParam({
            component: 'plex',
            param: { name: 'plex_trakt_status_debug', type: 'button' },
            field: { name: 'Проверить подключение к Trakt' },
            onRender: function (item) {
                if (!traktStatusEnabled()) { item.hide(); return; }
                item.show();
                item.find('.plex-field-status').remove();
                var status;
                if (!traktConfigured()) {
                    status = 'не найдены client_id/токен Trakt в хранилище Lampa — войдите в LampaTrakt';
                } else if (_traktLastFetch.ok === true) {
                    status = 'ок, ' + new Date(_traktLastFetch.at).toLocaleString() + ' — фильмов: ' + _traktLastFetch.movies + ', сериалов: ' + _traktLastFetch.shows;
                } else if (_traktLastFetch.ok === false) {
                    status = 'ошибка (' + new Date(_traktLastFetch.at).toLocaleString() + '): ' + _traktLastFetch.error;
                } else {
                    status = 'ещё не проверялось — нажмите, чтобы проверить';
                }
                item.append('<div class="settings-param__value plex-field-status" style="font-size:.85em;opacity:.65">' + escapeHtml(status) + '</div>');
            },
            onChange: function () {
                Lampa.Noty.show('Проверяю подключение к Trakt…');
                getTraktWatchedIndex().then(function () {
                    Lampa.Noty.show('Trakt: подключение успешно');
                }).catch(function () {
                    Lampa.Noty.show('Trakt: ошибка подключения — см. статус ниже');
                }).then(function () { Lampa.Settings.update(); });
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'plex',
            param: { name: 'plex_trakt_sync_to_plex', type: 'button' },
            field: { name: 'Синхронизировать статусы в Plex', description: 'Отметить в Plex как просмотренные фильмы и полностью просмотренные сериалы из истории Trakt. Действие ручное и необратимое без отдельной отметки «не просмотрено» в самом Plex.' },
            onRender: function (item) { if (traktStatusEnabled()) item.show(); else item.hide(); },
            onChange: function () { confirmTraktSyncToPlex(); }
        });

        Lampa.SettingsApi.addParam({
            component: 'plex',
            param: { name: 'plex_badges_debug', type: 'button' },
            field: { name: 'Проверить бейджи LampaTrakt на медиатеке', description: 'Диагностика последней попытки применить window.TraktTV.applyBadges к карточке в разделе «Plex». Не гейтится тумблером «Статусы Trakt.TV» — бейджи работают независимо от него.' },
            onRender: function (item) {
                if (!traktAvailable()) { item.hide(); return; }
                item.show();
                item.find('.plex-field-status').remove();
                var status;
                if (!_plexBadgesLastAttempt) {
                    status = 'ещё не было карточек — откройте раздел «Plex» в меню, затем вернитесь сюда';
                } else {
                    var a = _plexBadgesLastAttempt;
                    var when = new Date(a.at).toLocaleString();
                    if (!a.available) {
                        status = when + ' — window.TraktTV.applyBadges не найден (LampaTrakt не установлен/не проинициализировался)';
                    } else if (a.error) {
                        status = when + ' — ошибка внутри applyBadges: ' + a.error;
                    } else {
                        status = when + ' — вызван без ошибок (id: ' + (a.id || '—') + ', тип: ' + (a.method || '—') + ')';
                    }
                }
                item.append('<div class="settings-param__value plex-field-status" style="font-size:.85em;opacity:.65">' + escapeHtml(status) + '</div>');
            },
            onChange: function () { Lampa.Settings.update(); }
        });

        sectionHeader('plex_other_section', 'Прочее');

        Lampa.SettingsApi.addParam({
            component: 'plex',
            param: { name: 'plex_reset', type: 'button' },
            field: { name: 'Сброс настроек Plex' },
            onChange: function () { resetSettings(); }
        });
    }

    // ---------------------------------------------------------------------
    // Левое меню
    // ---------------------------------------------------------------------

    function initMenu() {
        Lampa.Menu.addButton(ICON_MENU, 'Plex', function () { openLibrary(); });
    }

    function openLibrary() {
        if (!isConfigured()) {
            Lampa.Noty.show('Сначала настройте подключение к Plex в настройках');
            Lampa.Controller.toggle('settings');
            Lampa.Settings.create('plex');
            return;
        }

        Api.sections().then(function (all) {
            var picked = getSections();
            var chosen = picked.length ? all.filter(function (s) { return picked.indexOf(s.key) >= 0; }) : all;

            if (!chosen.length) {
                Lampa.Noty.show('Не выбраны медиатеки Plex в настройках');
                Lampa.Controller.toggle('settings');
                Lampa.Settings.create('plex');
                return;
            }

            Lampa.Activity.push({
                component: 'plex_hub',
                title: 'Plex',
                plex_sections_available: chosen
            });
        }).catch(function () { Lampa.Noty.show('Не удалось подключиться к Plex'); });
    }

    // ---------------------------------------------------------------------
    // Карточка → hybrid-роутинг (родная карточка TMDB либо своя модалка)
    // ---------------------------------------------------------------------

    function toCard(item) {
        var tmdbId = findTmdbId(item);
        var poster = item.thumb ? plexUrl(item.thumb) : '';
        var backdrop = item.art ? plexUrl(item.art) : poster;
        var method = item.type === 'show' ? 'tv' : 'movie';

        var base = {
            title: item.title,
            original_title: item.title,
            release_date: item.year ? String(item.year) : '',
            vote_average: Number(item.rating || item.audienceRating || 0),
            poster: poster,
            image: backdrop,
            img: poster,
            plex_rating_key: item.ratingKey,
            plex_section: item.librarySectionID != null ? String(item.librarySectionID) : '',
            plex_type: method === 'tv' ? 'show' : 'movie'
        };

        // Родной бейдж «TV» на постере (interaction/card/module/icons.js) вешает
        // сама Lampa по одному-единственному признаку — истинному `original_name`
        // (конвенция TMDB для сериалов); наши карточки строятся из данных Plex,
        // где такого поля никогда не было, поэтому бейдж не появлялся ни на
        // сопоставленных с TMDB, ни тем более на собственных карточках без
        // сопоставления. Это никак не связано с source:'tmdb'/component:'full'
        // ниже — модуль Icons смотрит только на сам объект данных карточки.
        if (method === 'tv') base.original_name = item.title;

        if (tmdbId) {
            extend(base, {
                component: 'full',
                source: 'tmdb',
                method: method,
                card_type: method,
                id: tmdbId
            });
            _plexTmdbIndex[method + ':' + tmdbId] = { ratingKey: item.ratingKey };
        }

        return base;
    }

    function onCardEnter(element) {
        if (element.component === 'full') {
            Lampa.Activity.push(element);
        } else {
            openPlexDetailModal(element);
        }
    }

    function openPlexDetailModal(cardStub) {
        Api.metadata(cardStub.plex_rating_key).then(function (meta) {
            var poster = meta.thumb ? plexUrl(meta.thumb) : '';
            var isShow = meta.type === 'show';
            var tmdbId = findTmdbId(meta);

            var html = $(
                '<div class="about plex-detail">' +
                (poster ? '<div class="plex-detail__poster"><img src="' + poster + '"></div>' : '') +
                '<div class="about__text plex-detail__title"><strong>' + escapeHtml(meta.title || '') +
                (meta.year ? ' (' + meta.year + ')' : '') + '</strong></div>' +
                '<div class="about__text plex-detail__status"></div>' +
                '<div class="about__text plex-detail__descr">' + escapeHtml(meta.summary || '') + '</div>' +
                '<div class="modal__button selector plex-detail__play">' + (isShow ? 'Выбрать серию' : 'Смотреть') + '</div>' +
                '</div>'
            );

            Lampa.Modal.open({
                title: meta.title || '',
                html: html,
                size: 'medium',
                select: html.find('.plex-detail__play')[0],
                onSelect: function () {
                    Lampa.Modal.close();
                    if (isShow) openSeasonPicker(meta);
                    else playRatingKey(meta.ratingKey, { title: meta.title, img: poster });
                },
                onBack: function () { Lampa.Modal.close(); Lampa.Controller.toggle('content'); }
            });

            statusLineForMeta(meta, tmdbId).then(function (text) {
                html.find('.plex-detail__status').text(text || '');
            });
        }).catch(function () { Lampa.Noty.show('Не удалось получить данные Plex'); });
    }

    // ---------------------------------------------------------------------
    // Индикатор загрузки — небольшое затемнение фона + спиннер в центре, пока
    // грузятся сезоны/серии (иногда несколько последовательных запросов к
    // Plex/Trakt подряд, без него экран как будто завис). Тап в любое место
    // или «назад» на пульте (в т.ч. Apple TV) — закрывает индикатор И
    // помечает загрузку отменённой: колбэк уже запущенного запроса, увидев
    // cancelled, просто ничего не открывает по завершении (честный abort
    // самого HTTP-запроса не пробрасывается через $.ajax-обёртку plexRequest
    // — не стоит того ради экрана, который и так закрылся мгновенно).
    // ---------------------------------------------------------------------

    var PLEX_LOADER_CTRL = 'plex_loader_ctrl';
    var _plexLoaderOverlay = null;
    var _plexLoaderState = null;

    function showPlexLoader() {
        hidePlexLoader();
        var overlay = $('<div class="plex-loading-overlay"><div class="plex-loading-overlay__spinner"></div></div>');
        $('body').append(overlay);
        _plexLoaderOverlay = overlay;

        var state = { cancelled: false };
        _plexLoaderState = state;

        overlay.on('click', function () { hidePlexLoader(); });

        Lampa.Controller.add(PLEX_LOADER_CTRL, {
            toggle: function () {},
            back: function () { hidePlexLoader(); },
            up: function () {},
            down: function () {},
            left: function () {},
            right: function () {}
        });
        Lampa.Controller.toggle(PLEX_LOADER_CTRL);

        return state;
    }

    function hidePlexLoader() {
        if (_plexLoaderOverlay) { _plexLoaderOverlay.remove(); _plexLoaderOverlay = null; }
        if (_plexLoaderState) { _plexLoaderState.cancelled = true; _plexLoaderState = null; }
        Lampa.Controller.toggle('content');
    }

    function openSeasonPicker(showMeta) {
        var loader = showPlexLoader();
        Api.children(showMeta.ratingKey).then(function (children) {
            if (loader.cancelled) return;
            hidePlexLoader();
            var seasons = children.filter(function (s) { return s.type === 'season'; });
            if (!seasons.length) { Lampa.Noty.show('Сезоны не найдены'); return; }
            Lampa.Select.show({
                title: showMeta.title,
                items: seasons.map(function (s) { return { title: s.title || ('Сезон ' + s.index), s: s }; }),
                onSelect: function (a) { openEpisodePicker(showMeta, a.s); },
                onBack: function () { Lampa.Controller.toggle('content'); }
            });
        }).catch(function () {
            if (loader.cancelled) return;
            hidePlexLoader();
            Lampa.Noty.show('Не удалось получить сезоны');
        });
    }

    function openEpisodePicker(showMeta, season) {
        var loader = showPlexLoader();
        Api.children(season.ratingKey).then(function (children) {
            if (loader.cancelled) return;
            var episodes = children.filter(function (e) { return e.type === 'episode'; });
            if (!episodes.length) { hidePlexLoader(); Lampa.Noty.show('Серии не найдены'); return; }

            var useTrakt = traktStatusEnabled();
            var showTmdbId = useTrakt ? findTmdbId(showMeta) : null;
            // Точный per-episode статус — из /shows/{traktId}/progress/watched (не из
            // /sync/watched/shows, где разбивки по сериям нет). null → откат на Plex.
            var traktEpSetPromise = (useTrakt && showTmdbId) ? getTraktShowEpisodeSet(showTmdbId) : Promise.resolve(null);

            traktEpSetPromise.then(function (traktEpSet) {
                if (loader.cancelled) return;
                hidePlexLoader();

                function episodeSubtitle(e) {
                    if (traktEpSet) {
                        return traktEpSet[season.index + ':' + e.index] ? 'Просмотрено' : '';
                    }
                    var watched = e.viewCount > 0;
                    var progress = (e.viewOffset && e.duration) ? Math.round(e.viewOffset / e.duration * 100) : 0;
                    return watched ? 'Просмотрено' : (progress ? progress + '%' : '');
                }

                Lampa.Select.show({
                    title: season.title || ('Сезон ' + season.index),
                    items: episodes.map(function (e) {
                        return { title: e.index + '. ' + (e.title || ''), subtitle: episodeSubtitle(e), e: e };
                    }),
                    onSelect: function (a) {
                        var idx = episodes.indexOf(a.e);
                        playEpisode(a.e, showMeta, episodes.slice(idx + 1));
                    },
                    onBack: function () { openSeasonPicker(showMeta); }
                });
            });
        }).catch(function () {
            if (loader.cancelled) return;
            hidePlexLoader();
            Lampa.Noty.show('Не удалось получить серии');
        });
    }

    // ---------------------------------------------------------------------
    // Воспроизведение (Direct Play) + синхронизация прогресса
    // ---------------------------------------------------------------------

    var _activePlexPlayback = null;

    function timelineHash(ratingKey) { return 'plex_' + ratingKey; }

    function buildSubtitles(part) {
        var subs = [];
        ((part && part.Stream) || []).forEach(function (s) {
            if (s.streamType === 3 && s.key) {
                subs.push({ url: plexUrl(s.key), label: s.displayTitle || s.languageTag || s.language || 'Subtitles', language: s.languageCode || '' });
            }
        });
        return subs;
    }

    // resume (опц.) — { viewOffset, duration } в миллисекундах Plex из того же
    // элемента списка, по которому пользователь видел прогресс (напр. 54%).
    // Берём его в приоритете над meta.viewOffset: гарантирует, что позиция
    // воспроизведения совпадает с показанной и не теряется, если повторный
    // запрос metadata по какой-то причине вернул элемент без viewOffset.
    // Собирает элемент плейлиста Plex с его позицией (timeline), точно как это
    // делает нативное воспроизведение торрентов Lampa (interaction/torrent.js):
    // каждый элемент playlist несёт свой timeline, а воспроизводимый элемент
    // ОБЯЗАН присутствовать в playlist со своим url — именно оттуда внешний плеер
    // на Apple TV (tvOS Pro/infuse) берёт стартовую позицию (в URL-схеме её нет).
    function buildPlexPlaylistItem(m, resume) {
        var mi = m.Media && m.Media[0];
        var mp = mi && mi.Part && mi.Part[0];
        if (!mp) return null;
        var h = timelineHash(m.ratingKey);
        var durationMs = (resume && resume.duration) ? resume.duration : (m.duration || mi.duration || 0);
        var viewOffsetMs = (resume && resume.viewOffset != null) ? resume.viewOffset : (m.viewOffset || 0);
        var duration = durationMs / 1000;
        var viewOffset = viewOffsetMs / 1000;
        var percent = duration ? Math.min(100, Math.round(viewOffset / duration * 100)) : 0;
        // Пишем позицию и в Lampa.Timeline (хранилище file_view) — как LampaTrakt.
        Lampa.Timeline.update({ hash: h, time: viewOffset, duration: duration, percent: percent });
        var subs = buildSubtitles(mp);
        var item = {
            title: m.grandparentTitle ? (m.grandparentTitle + ' - ' + m.title) : m.title,
            url: plexUrl(mp.key),
            timeline: Lampa.Timeline.view(h)
        };
        if (subs.length) item.subtitles = subs;
        return item;
    }

    function playMeta(meta, cardData, playlistMetas, resume, trakt) {
        var current = buildPlexPlaylistItem(meta, resume);
        if (!current) { Lampa.Noty.show('Не найден файл для воспроизведения (нужен Direct Play — транскодирование не поддерживается)'); return; }

        // Плейлист начинается с ТЕКУЩЕГО элемента (его url === playData.url), далее
        // следующие серии — каждая со своим timeline, чтобы при переходе resume тоже работал.
        // Параллельно ведём tracked — {ratingKey, trakt} по каждому элементу, чтобы
        // при закрытии плеера отчитаться в Plex/Trakt по КАЖДОЙ реально просмотренной
        // серии (важно для просмотра «взахлёб» через автопереход по плейлисту).
        // t0 — стартовая позиция элемента (сек), чтобы при закрытии отчитаться только
        // по тем, где позиция реально выросла (эту серию в этой сессии смотрели).
        var playlist = [current];
        var tracked = [{ ratingKey: meta.ratingKey, trakt: trakt || null, t0: (current.timeline && current.timeline.time) || 0 }];
        (playlistMetas || []).forEach(function (m) {
            var it = buildPlexPlaylistItem(m);
            if (!it) return;
            playlist.push(it);
            var nextTrakt = (trakt && trakt.type === 'episode')
                ? { type: 'episode', tmdb: trakt.tmdb, season: m.parentIndex, number: m.index }
                : null;
            tracked.push({ ratingKey: m.ratingKey, trakt: nextTrakt, t0: (it.timeline && it.timeline.time) || 0 });
        });

        var playData = {
            url: current.url,
            title: current.title,
            card: cardData,
            timeline: current.timeline,
            playlist: playlist
        };

        if (current.subtitles) playData.subtitles = current.subtitles;

        _activePlexPlayback = { items: tracked, duration: (current.timeline && current.timeline.duration) || 0 };

        Lampa.Player.play(playData);
    }

    function playRatingKey(ratingKey, cardData, trakt) {
        Api.metadata(ratingKey).then(function (meta) { playMeta(meta, cardData, null, null, trakt); })
            .catch(function () { Lampa.Noty.show('Не удалось получить данные для воспроизведения'); });
    }

    function playEpisode(episodeStub, showMeta, nextEpisodeStubs) {
        // Позиция берётся из самого элемента списка (episodeStub) — это то, что
        // показано пользователю (напр. 54%), гарантированно с viewOffset.
        var resume = { viewOffset: episodeStub.viewOffset || 0, duration: episodeStub.duration || 0 };
        // Идентификатор для Trakt: tmdb сериала (из showMeta) + сезон/номер серии.
        var showTmdb = findTmdbId(showMeta);
        var trakt = showTmdb ? { type: 'episode', tmdb: showTmdb, season: episodeStub.parentIndex, number: episodeStub.index } : null;
        Api.metadata(episodeStub.ratingKey).then(function (meta) {
            var poster = meta.thumb ? plexUrl(meta.thumb) : (showMeta.thumb ? plexUrl(showMeta.thumb) : '');
            var cardData = { title: showMeta.title + ' - ' + meta.title, img: poster };

            var upcoming = (nextEpisodeStubs || []).slice(0, 5);
            if (upcoming.length) {
                Promise.all(upcoming.map(function (e) { return Api.metadata(e.ratingKey).catch(function () { return null; }); }))
                    .then(function (metas) { playMeta(meta, cardData, metas.filter(Boolean), resume, trakt); });
            } else {
                playMeta(meta, cardData, null, resume, trakt);
            }
        }).catch(function () { Lampa.Noty.show('Не удалось получить данные серии'); });
    }

    function reportProgressToPlex(ratingKey, timeSec, durationSec) {
        if (!isConfigured() || !ratingKey || !syncEnabled()) return;

        plexRequest('/:/timeline', {
            ratingKey: ratingKey,
            key: '/library/metadata/' + ratingKey,
            identifier: 'com.plexapp.plugins.library',
            state: 'stopped',
            time: Math.round((timeSec || 0) * 1000),
            duration: Math.round((durationSec || 0) * 1000)
        }).catch(function () {});

        if (durationSec && timeSec / durationSec >= 0.9) {
            plexRequest('/:/scrobble', { key: ratingKey, identifier: 'com.plexapp.plugins.library' }).catch(function () {});
        }
    }

    function initTimelineSync() {
        Lampa.Player.listener.follow('destroy', function () {
            if (!_activePlexPlayback) return;
            var info = _activePlexPlayback;
            _activePlexPlayback = null;

            // Отчитываемся по каждому элементу, который реально трогали (road.time>0):
            // при бинж-просмотре через плейлист так отметятся все просмотренные серии,
            // а не только первая. Нетронутые следующие серии (time=0) пропускаются.
            (info.items || []).forEach(function (it) {
                var road = Lampa.Timeline.view(timelineHash(it.ratingKey));
                if (!road || !road.time) return;
                // Позиция не выросла со старта → серию в этой сессии не смотрели, пропускаем.
                if (road.time <= (it.t0 || 0) + 1) return;
                var durSec = road.duration || info.duration;
                reportProgressToPlex(it.ratingKey, road.time, durSec);
                reportPlaybackToTrakt(it.trakt, road.time, durSec);
            });
        });
    }

    // ---------------------------------------------------------------------
    // Сортировка/фильтр по году объединённого списка (Plex сам сортирует и
    // фильтрует только внутри одной медиатеки — при просмотре сразу
    // нескольких, а также при сортировке "Случайно" или фильтре по году,
    // делаем это на клиенте). Набор видов сортировки — как у «Хочу
    // посмотреть» в LampaTrakt, без вариантов, требующих Trakt VIP
    // (imdb/tmdb/RT/Metascore/голоса — этих данных и у Plex нет) и без тех,
    // для которых в Plex попросту нет источника данных: «По позиции» (ручной
    // порядок в watchlist Trakt), «Популярность» (метрика самого Trakt) и
    // «В коллекции» (дата добавления в коллекцию Trakt, для Plex не
    // отличается от «Дата добавления»).
    // ---------------------------------------------------------------------

    var PLEX_SORT_LABELS = {
        added: 'По дате добавления',
        title: 'По названию',
        released: 'По дате выхода',
        runtime: 'По длительности',
        random: 'Случайно',
        percentage: 'По рейтингу',
        my_rating: 'Моя оценка',
        watched: 'Просмотрено'
    };
    var PLEX_SORT_ORDER = ['added', 'title', 'released', 'runtime', 'random', 'percentage', 'my_rating', 'watched'];

    // Сортировка по умолчанию — настраивается в Настройки → Plex, используется
    // как стартовое состояние `activeSort` при открытии «Plex» в левом меню.
    function getDefaultSort() {
        var field = Lampa.Storage.get('plex_default_sort_field', 'added');
        if (PLEX_SORT_ORDER.indexOf(field) < 0) field = 'added';
        var order = Lampa.Storage.get('plex_default_sort_order', 'desc');
        if (order !== 'asc' && order !== 'desc') order = 'desc';
        return { field: field, order: order };
    }

    function setDefaultSort(field, order) {
        Lampa.Storage.set('plex_default_sort_field', field);
        Lampa.Storage.set('plex_default_sort_order', order);
    }

    function sortLabelWithArrow(sort) {
        if (sort.field === 'random') return PLEX_SORT_LABELS.random;
        return PLEX_SORT_LABELS[sort.field] + ' ' + (sort.order === 'desc' ? '↓' : '↑');
    }

    // Тот же приём выбора, что и у кнопки «Сортировка» внутри «Plex»
    // (openSortMenu в plex_hub): повторный выбор уже выбранного пункта
    // переключает направление вместо повторного выставления 'asc'.
    function openDefaultSortPicker() {
        var current = getDefaultSort();
        var items = PLEX_SORT_ORDER.map(function (field) {
            var suffix = (current.field === field && field !== 'random') ? ('  ' + (current.order === 'desc' ? '↓' : '↑')) : '';
            return { title: PLEX_SORT_LABELS[field] + suffix, field: field, selected: current.field === field };
        });

        Lampa.Select.show({
            title: 'Сортировка по умолчанию',
            items: items,
            onSelect: function (a) {
                var order = (current.field === a.field && current.order === 'asc') ? 'desc' : 'asc';
                setDefaultSort(a.field, order);
                Lampa.Settings.update();
            },
            onBack: function () { Lampa.Controller.toggle('settings_component'); }
        });
    }

    // Соответствие полю сортировки Plex (используется, когда можно доверить
    // сортировку и постраничную загрузку самому серверу — см. ниже).
    var PLEX_NATIVE_SORT_KEY = {
        added: 'addedAt',
        title: 'titleSort',
        released: 'originallyAvailableAt',
        runtime: 'duration',
        percentage: 'rating',
        my_rating: 'userRating',
        watched: 'lastViewedAt'
    };

    function plexSortValue(item, field) {
        if (field === 'released') return Number((item.originallyAvailableAt || '').slice(0, 4)) || Number(item.year || 0);
        if (field === 'runtime') return Number(item.duration || 0);
        if (field === 'percentage') return Number(item.rating || item.audienceRating || 0);
        if (field === 'my_rating') return Number(item.userRating || 0);
        if (field === 'watched') return Number(item.lastViewedAt || 0);
        if (field === 'added') return Number(item.addedAt || 0);
        return (item.titleSort || item.title || '').toLowerCase();
    }

    function shuffleItems(items) {
        var arr = items.slice();
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
        }
        return arr;
    }

    function sortItems(items, field, order) {
        if (field === 'random') return shuffleItems(items);
        var sorted = items.slice().sort(function (a, b) {
            var av = plexSortValue(a, field), bv = plexSortValue(b, field);
            if (av < bv) return -1;
            if (av > bv) return 1;
            return 0;
        });
        if (order === 'desc') sorted.reverse();
        return sorted;
    }

    // Год выпуска — фильтр (не сортировка): либо конкретный год, либо
    // диапазон вида "2020-2024"/"1920-1969" (границы в любом порядке).
    function plexYearMatches(item, value) {
        if (!value) return true;
        var y = Number(item.year || 0);
        if (!y) return false;
        if (value.indexOf('-') > 0) {
            var parts = value.split('-');
            var lo = Math.min(Number(parts[0]), Number(parts[1]));
            var hi = Math.max(Number(parts[0]), Number(parts[1]));
            return y >= lo && y <= hi;
        }
        return y === Number(value);
    }

    function yearFilterLabel(value) {
        if (!value) return 'Год';
        if (value === '1920-1969') return 'до 1970';
        return value.indexOf('-') > 0 ? value.replace('-', '–') : value;
    }

    // Портировано из buildYearFilterItems в LampaTrakt (список фильтров года
    // у «Хочу посмотреть») — те же группы годов, без Lampa.Lang (в этом
    // плагине нет отдельного слоя переводов, весь текст сразу на русском).
    function buildYearFilterItems(cur, selectedYear) {
        var items = [{ title: 'Любой', value: '', selected: !selectedYear }];
        function push(title, value) { items.push({ title: title, value: value, selected: selectedYear === value }); }
        var indYears = [];
        for (var y = cur; y >= 2020; y--) indYears.push(y);
        var extraGroups = [];
        while (indYears.length > 7) {
            var oldest = indYears[indYears.length - 1];
            var bStart = Math.floor(oldest / 5) * 5;
            var bEnd = bStart + 4;
            var full = true;
            for (var k = bStart; k <= bEnd; k++) { if (indYears.indexOf(k) < 0) { full = false; break; } }
            if (!full) break;
            indYears = indYears.filter(function (yy) { return yy < bStart || yy > bEnd; });
            extraGroups.unshift(bEnd + '-' + bStart);
        }
        indYears.forEach(function (yy) { push(String(yy), String(yy)); });
        extraGroups.forEach(function (v) { push(v.replace('-', '–'), v); });
        push('2019–2015', '2019-2015');
        push('2014–2010', '2014-2010');
        push('2009–2005', '2009-2005');
        push('2004–2000', '2004-2000');
        push('1999–1990', '1999-1990');
        push('1989–1980', '1989-1980');
        push('1979–1970', '1979-1970');
        push('до 1970', '1920-1969');
        return items;
    }

    // ---------------------------------------------------------------------
    // Обложки из TMDB вместо Plex (по желанию пользователя — настройка
    // «Обложки из TMDB») — чтобы в сетке «Plex» все постеры выглядели
    // единообразно, даже если в самом Plex у части тайтлов стоят свои/другие
    // обложки. Используем публичный ключ и image-прокси самой Lampa
    // (Lampa.TMDB.key()/.image()) — тот же, которым Lampa грузит постеры в
    // остальных каталогах, отдельный TMDB API-ключ плагину не нужен.
    // ---------------------------------------------------------------------

    function usePlexTmdbPosters() {
        return Lampa.Storage.get('plex_poster_source_tmdb', false) === true;
    }

    function fetchTmdbPosterUrl(id, method) {
        return new Promise(function (resolve) {
            $.ajax({
                url: Lampa.TMDB.api((method === 'tv' ? 'tv/' : 'movie/') + id + '?api_key=' + Lampa.TMDB.key() + '&language=ru'),
                dataType: 'json',
                timeout: 10000
            }).done(function (data) {
                var path = data && data.poster_path;
                resolve(path ? Lampa.TMDB.image('t/p/w500' + path) : null);
            }).fail(function () { resolve(null); });
        });
    }

    // Подменяет poster/img только у карточек с известным tmdb id — карточки
    // без сопоставления с TMDB (нет данных, чтобы что-то подменить) остаются
    // с постером из Plex, как и раньше. Ошибка запроса к TMDB для отдельной
    // карточки — просто оставляем постер Plex для неё же, не валим всю
    // страницу целиком.
    function applyTmdbPosters(results) {
        if (!usePlexTmdbPosters()) return Promise.resolve(results);
        var withId = results.filter(function (r) { return r.id && (r.method === 'movie' || r.method === 'tv'); });
        if (!withId.length) return Promise.resolve(results);

        return Promise.all(withId.map(function (r) {
            return fetchTmdbPosterUrl(r.id, r.method).then(function (url) {
                if (url) { r.poster = url; r.img = url; }
            });
        })).then(function () { return results; });
    }

    // ---------------------------------------------------------------------
    // Компонент "Медиатека Plex" (сетка карточек)
    // ---------------------------------------------------------------------

    // Быстрый путь — одна медиатека, без года/жанра/страны, сортировка не
    // "Случайно": честная постраничная загрузка и сортировка средствами
    // самого Plex (не тянет всё в память). Во всех остальных случаях (сразу
    // несколько медиатек — Plex не даёт единого endpoint на объединённый
    // список; активен фильтр года — его можно проверить только на клиенте;
    // сортировка "Случайно") — собираем все страницы через fetchCombinedItems
    // и сортируем/фильтруем/пагинируем на клиенте.
    function makePlexLibraryComponent(object) {
        if (!object.page) object.page = 1;
        var comp = Lampa.Maker.make('Category', object);
        var page = 1;
        var totalPages = 1;
        var pageSize = 50;
        var sectionKeys = object.plex_sections || [];
        var sort = object.plex_sort || { field: 'added', order: 'desc' };
        var forceClientSide = sectionKeys.length > 1 || !!object.plex_year || !!object.plex_genre_title || !!object.plex_country_title || sort.field === 'random';
        var mergedItems = null;

        // Жанр/страна — ключи у каждой медиатеки свои (см. Api.genres/countries),
        // поэтому для каждой секции резолвим её собственный ключ; секция без
        // такого значения фильтра целиком пропускается (гарантированно пустая).
        function sectionExtraParams(sectionKey) {
            var extra = {};
            if (object.plex_genre_title) {
                if (!object.plex_genre_by_section || !object.plex_genre_by_section[sectionKey]) return null;
                extra.genre = object.plex_genre_by_section[sectionKey];
            }
            if (object.plex_country_title) {
                if (!object.plex_country_by_section || !object.plex_country_by_section[sectionKey]) return null;
                extra.country = object.plex_country_by_section[sectionKey];
            }
            return extra;
        }

        function serveClientSidePage(pageNum, resolve, reject) {
            var ready = mergedItems ? Promise.resolve(mergedItems) : fetchCombinedItems(sectionKeys, object.plex_query || '', sectionExtraParams).then(function (items) {
                if (object.plex_year) items = items.filter(function (it) { return plexYearMatches(it, object.plex_year); });
                mergedItems = sortItems(items, sort.field, sort.order);
                return mergedItems;
            });

            ready.then(function (items) {
                totalPages = Math.max(1, Math.ceil(items.length / pageSize));
                var start = (pageNum - 1) * pageSize;
                var results = items.slice(start, start + pageSize).map(toCard);
                return applyTmdbPosters(results);
            }).then(function (results) {
                resolve({ results: results, total_pages: totalPages, page: pageNum });
            }).catch(function () { reject(); });
        }

        function serveServerPage(pageNum, resolve, reject) {
            var opts = { start: (pageNum - 1) * pageSize, size: pageSize, query: object.plex_query || '' };
            if (!opts.query) opts.sort = (PLEX_NATIVE_SORT_KEY[sort.field] || 'titleSort') + ':' + sort.order;

            Api.list(sectionKeys[0], opts).then(function (data) {
                totalPages = Math.max(1, Math.ceil(data.totalSize / pageSize));
                var results = data.items.map(toCard);
                return applyTmdbPosters(results);
            }).then(function (results) {
                resolve({ results: results, total_pages: totalPages, page: pageNum });
            }).catch(function () { reject(); });
        }

        function servePage(pageNum, resolve, reject) {
            if (forceClientSide) serveClientSidePage(pageNum, resolve, reject);
            else serveServerPage(pageNum, resolve, reject);
        }

        comp.use({
            onCreate: function () {
                page = 1;
                servePage(page, this.build.bind(this), this.empty.bind(this));
            },
            onNext: function (resolve, reject) {
                if (page >= totalPages) { reject.call(this); return; }
                page++;
                servePage(page, resolve, reject);
            },
            onController: function (controller) {
                if (typeof object.onHead !== 'function') return;
                controller.up = function () {
                    if (Navigator.canmove('up')) Navigator.move('up');
                    else object.onHead();
                };
            },
            onInstance: function (card, element) {
                card.use({
                    onEnter: function () { onCardEnter(element); },
                    onFocus: function () { Lampa.Background.change(Lampa.Utils.cardImgBackground(element)); }
                });

                // Бейджи LampaTrakt (просмотрено/смотрю/хочу посмотреть/дата
                // релиза) вешаются самим LampaTrakt только на карточки внутри
                // его собственных хабов (прямой вызов в его onInstance, а не
                // через общее событие 'catalog'/'line') — карточки чужих
                // сеток, включая нашу, он сам не видит. LampaTrakt v3.2.50+
                // публикует applyBadges специально для таких внешних сеток;
                // безопасна для повторного вызова и ничего не делает, если
                // LampaTrakt не установлен или у карточки нет tmdb id/типа
                // (элементы Plex без сопоставления с TMDB — у них этих полей
                // нет вовсе, для них бейджи принципиально невозможны).
                //
                // Вызываем НЕ синхронно здесь, а отложенно (следующий тик):
                // `onInstance` в родном create.js вызывается ДО `item.create()`
                // (`this.emit('instance', item, element); item.create(); ...`),
                // то есть DOM самой карточки (`card.render()`) на этот момент
                // ещё не построен — applyBadges, скорее всего, не находит куда
                // вставлять бейджи и молча ничего не делает. setTimeout(0)
                // гарантированно попадает уже ПОСЛЕ синхронного item.create().
                // Плюс try/catch и запись результата в _plexBadgesLastAttempt —
                // чтобы можно было проверить прямо в настройках плагина, не
                // подключая консоль/логи устройства (см. «Проверить бейджи
                // LampaTrakt на медиатеке» в разделе «Прочее»).
                setTimeout(function () {
                    var available = !!(window.TraktTV && typeof window.TraktTV.applyBadges === 'function');
                    var data = card.data || element || {};
                    var attempt = { at: Date.now(), available: available, id: data.id || null, method: data.method || data.card_type || null, error: '' };
                    try {
                        if (available) window.TraktTV.applyBadges(card);
                    } catch (err) {
                        attempt.error = (err && err.message) || String(err);
                    }
                    _plexBadgesLastAttempt = attempt;
                }, 0);
            }
        });

        return comp;
    }

    Lampa.Component.add('plex_library', makePlexLibraryComponent);

    // ---------------------------------------------------------------------
    // Компонент "Медиатека Plex" — хаб: объединённый список всех выбранных
    // медиатек + строка фильтров сверху, по образцу «Хочу посмотреть» из
    // LampaTrakt (те же 5 кнопок в том же порядке — медиатека вместо типа
    // контента, год, жанр, страна, сортировка; свой Controller-стейт для
    // строки фильтров, переключаемый через onHead/onController у вложенного
    // Category-компонента; цвет активной кнопки — золотой Plex вместо
    // фиолетового Trakt).
    // ---------------------------------------------------------------------

    Lampa.Component.add('plex_hub', function (object) {
        var FILTER_CTRL = 'plex_hub_controls';
        var activity, html, controls, filtersRow, body;
        var currentView = null;
        var lastFilterFocus = null;
        var sections = object.plex_sections_available || [];
        var activeSectionKey = null; // null = «Все»
        var activeQuery = '';
        var activeYear = '';
        var activeGenreTitle = '';
        var activeGenreBySection = null;
        var activeCountryTitle = '';
        var activeCountryBySection = null;
        var activeSort = getDefaultSort();
        var libraryBtn, yearBtn, genreBtn, countryBtn, sortBtn;
        var genreOptionsPromise = null;
        var countryOptionsPromise = null;

        function restoreFilters() { Lampa.Controller.toggle(FILTER_CTRL); }

        function activeSection() {
            return sections.filter(function (s) { return s.key === activeSectionKey; })[0];
        }

        function getLibraryLabel() {
            var base = activeSectionKey ? (activeSection() ? activeSection().title : 'Все') : 'Все';
            return activeQuery ? (base + ': ' + activeQuery) : base;
        }

        function getYearLabel() { return yearFilterLabel(activeYear); }
        function getGenreLabel() { return activeGenreTitle || 'Жанр'; }
        function getCountryLabel() { return activeCountryTitle || 'Страна'; }

        function getSortLabel() { return sortLabelWithArrow(activeSort); }

        // Подсветка активной кнопки/фокуса — целиком через CSS-класс
        // .plex-hub__filter--active (см. injectStyles), как в LampaTrakt, без
        // инлайн-стилей: так неактивные кнопки остаются просто текстом, а не
        // «коробкой».
        function updateBtn(btn, label, active) {
            btn.find('.plex-hub__filter-label').text(label);
            btn.toggleClass('plex-hub__filter--active', !!active);
        }

        function makeBtn() {
            return $('<div class="simple-button simple-button--filter selector plex-hub__filter"><div class="plex-hub__filter-label"></div></div>');
        }

        // Значения фильтра (жанр/страна), реально существующие хотя бы в
        // одной из выбранных медиатек — объединяем по названию (ключи у
        // разных медиатек разные), плюс карта "название → {sectionKey: key}"
        // для резолва при фактическом запросе. Загружается один раз и
        // кэшируется на время жизни хаба.
        function loadFilterOptions(apiMethod) {
            var bySection = {};
            var titleSet = {};
            var titles = [];
            var chain = sections.reduce(function (prev, s) {
                return prev.then(function () {
                    return apiMethod(s.key).then(function (list) {
                        list.forEach(function (g) {
                            if (!titleSet[g.title]) { titleSet[g.title] = true; titles.push(g.title); }
                            bySection[g.title] = bySection[g.title] || {};
                            bySection[g.title][s.key] = g.key;
                        });
                    }).catch(function () {});
                });
            }, Promise.resolve());
            return chain.then(function () {
                titles.sort(function (a, b) { return a.localeCompare(b, 'ru'); });
                return { titles: titles, bySection: bySection };
            });
        }

        function ensureGenreOptions() {
            if (!genreOptionsPromise) genreOptionsPromise = loadFilterOptions(Api.genres);
            return genreOptionsPromise;
        }

        function ensureCountryOptions() {
            if (!countryOptionsPromise) countryOptionsPromise = loadFilterOptions(Api.countries);
            return countryOptionsPromise;
        }

        function openSearch() {
            Lampa.Input.edit({ title: activeSectionKey ? ('Поиск: ' + (activeSection() ? activeSection().title : '')) : 'Поиск по всем медиатекам', value: activeQuery, free: true, nosave: true }, function (q) {
                activeQuery = q || '';
                updateBtn(libraryBtn, getLibraryLabel(), true);
                rebuildView();
                restoreFilters();
            });
        }

        function openLibraryFilter() {
            var items = [{ title: 'Поиск', action: 'search' }, { title: 'Все', key: null, selected: !activeSectionKey }];
            sections.forEach(function (s) { items.push({ title: s.title, key: s.key, selected: activeSectionKey === s.key }); });

            Lampa.Select.show({
                title: 'Медиатека',
                items: items,
                onSelect: function (a) {
                    if (a.action === 'search') { openSearch(); return; }
                    activeSectionKey = a.key;
                    activeQuery = '';
                    updateBtn(libraryBtn, getLibraryLabel(), true);
                    rebuildView();
                    restoreFilters();
                },
                onBack: restoreFilters
            });
        }

        function openYearFilter() {
            var items = buildYearFilterItems(new Date().getFullYear(), activeYear);
            Lampa.Select.show({
                title: 'Год выпуска',
                items: items,
                onSelect: function (a) {
                    activeYear = a.value;
                    updateBtn(yearBtn, getYearLabel(), !!activeYear);
                    rebuildView();
                    restoreFilters();
                },
                onBack: restoreFilters
            });
        }

        function openGenreFilter() {
            ensureGenreOptions().then(function (opts) {
                var items = [{ title: 'Любой', value: '', selected: !activeGenreTitle }];
                opts.titles.forEach(function (t) { items.push({ title: t, value: t, selected: activeGenreTitle === t }); });

                Lampa.Select.show({
                    title: 'Жанр',
                    items: items,
                    onSelect: function (a) {
                        activeGenreTitle = a.value;
                        activeGenreBySection = a.value ? (opts.bySection[a.value] || {}) : null;
                        updateBtn(genreBtn, getGenreLabel(), !!activeGenreTitle);
                        rebuildView();
                        restoreFilters();
                    },
                    onBack: restoreFilters
                });
            }).catch(function () { Lampa.Noty.show('Не удалось получить жанры Plex'); restoreFilters(); });
        }

        function openCountryFilter() {
            ensureCountryOptions().then(function (opts) {
                var items = [{ title: 'Любая', value: '', selected: !activeCountryTitle }];
                opts.titles.forEach(function (t) { items.push({ title: t, value: t, selected: activeCountryTitle === t }); });

                Lampa.Select.show({
                    title: 'Страна',
                    items: items,
                    onSelect: function (a) {
                        activeCountryTitle = a.value;
                        activeCountryBySection = a.value ? (opts.bySection[a.value] || {}) : null;
                        updateBtn(countryBtn, getCountryLabel(), !!activeCountryTitle);
                        rebuildView();
                        restoreFilters();
                    },
                    onBack: restoreFilters
                });
            }).catch(function () { Lampa.Noty.show('Не удалось получить страны Plex'); restoreFilters(); });
        }

        function openSortMenu() {
            var items = PLEX_SORT_ORDER.map(function (field) {
                var suffix = (activeSort.field === field && field !== 'random') ? ('  ' + (activeSort.order === 'desc' ? '↓' : '↑')) : '';
                return { title: PLEX_SORT_LABELS[field] + suffix, field: field, selected: activeSort.field === field };
            });

            Lampa.Select.show({
                title: 'Сортировка',
                items: items,
                onSelect: function (a) {
                    activeSort.order = (activeSort.field === a.field && activeSort.order === 'asc') ? 'desc' : 'asc';
                    activeSort.field = a.field;
                    updateBtn(sortBtn, getSortLabel(), true);
                    rebuildView();
                    restoreFilters();
                },
                onBack: restoreFilters
            });
        }

        function rebuildView() {
            if (currentView && currentView.destroy) currentView.destroy();
            body.empty();

            var sectionKeys = activeSectionKey ? [activeSectionKey] : sections.map(function (s) { return s.key; });

            currentView = makePlexLibraryComponent(extend({}, object, {
                plex_sections: sectionKeys,
                plex_query: activeQuery,
                plex_sort: activeSort,
                plex_year: activeYear,
                plex_genre_title: activeGenreTitle,
                plex_genre_by_section: activeGenreBySection,
                plex_country_title: activeCountryTitle,
                plex_country_by_section: activeCountryBySection,
                onHead: function () { Lampa.Controller.toggle(FILTER_CTRL); }
            }));
            currentView.activity = activity;
            currentView.create();
            body.append(currentView.render());
            if (currentView.start) currentView.start();
        }

        return {
            create: function () {
                activity = this.activity;
                html = $('<div class="plex-hub"></div>');
                controls = $('<div class="plex-hub__controls"></div>');
                body = $('<div class="plex-hub__body"></div>');
                filtersRow = $('<div class="plex-hub__filters"></div>');

                libraryBtn = makeBtn(getLibraryLabel());
                libraryBtn.on('hover:enter', function () { lastFilterFocus = libraryBtn[0]; openLibraryFilter(); });
                updateBtn(libraryBtn, getLibraryLabel(), true);

                yearBtn = makeBtn(getYearLabel());
                yearBtn.on('hover:enter', function () { lastFilterFocus = yearBtn[0]; openYearFilter(); });
                updateBtn(yearBtn, getYearLabel(), !!activeYear);

                genreBtn = makeBtn(getGenreLabel());
                genreBtn.on('hover:enter', function () { lastFilterFocus = genreBtn[0]; openGenreFilter(); });
                updateBtn(genreBtn, getGenreLabel(), !!activeGenreTitle);

                countryBtn = makeBtn(getCountryLabel());
                countryBtn.on('hover:enter', function () { lastFilterFocus = countryBtn[0]; openCountryFilter(); });
                updateBtn(countryBtn, getCountryLabel(), !!activeCountryTitle);

                sortBtn = makeBtn(getSortLabel());
                sortBtn.on('hover:enter', function () { lastFilterFocus = sortBtn[0]; openSortMenu(); });
                updateBtn(sortBtn, getSortLabel(), true);

                filtersRow.append(libraryBtn, yearBtn, genreBtn, countryBtn, sortBtn);
                controls.append(filtersRow);
                html.append(controls, body);

                Lampa.Controller.add(FILTER_CTRL, {
                    toggle: function () {
                        Lampa.Controller.collectionSet(controls);
                        var focus = lastFilterFocus && document.body.contains(lastFilterFocus) ? lastFilterFocus : filtersRow.find('.selector')[0];
                        Lampa.Controller.collectionFocus(focus || false, controls);
                    },
                    right: function () { Navigator.move('right'); },
                    left: function () {
                        if (Navigator.canmove('left')) Navigator.move('left');
                        else Lampa.Controller.toggle('menu');
                    },
                    down: function () {
                        if (Navigator.canmove('down')) Navigator.move('down');
                        else Lampa.Controller.toggle('content');
                    },
                    up: function () {
                        if (Navigator.canmove('up')) Navigator.move('up');
                        else Lampa.Controller.toggle('head');
                    },
                    back: function () { Lampa.Activity.backward(); }
                });

                rebuildView();

                return this.render();
            },
            render: function (js) { return js ? html[0] : html; },
            start: function () { if (currentView && currentView.start) currentView.start(); },
            pause: function () {},
            stop: function () {},
            destroy: function () {
                if (currentView && currentView.destroy) currentView.destroy();
                if (html) html.remove();
                currentView = null;
            }
        };
    });

    // ---------------------------------------------------------------------
    // Гибридная интеграция с родной карточкой (кнопка "Смотреть из Plex")
    // ---------------------------------------------------------------------

    // Хэш нашей кнопки — тем же алгоритмом и с той же нормализацией
    // (Lampa.Utils.hash от outerHTML без класса focus), которым родной
    // components/full/start/buttons.js сопоставляет Storage-ключ
    // 'full_btn_priority' с конкретной кнопкой в .buttons--container.
    // Разметка кнопки статична, поэтому хэш одинаков для любой карточки —
    // считаем один раз и кэшируем.
    var _plexButtonHash = null;
    function plexButtonHash() {
        if (_plexButtonHash) return _plexButtonHash;
        var probe = $('<div class="full-start__button selector plex-watch-btn">' + PLEX_PLAY_ICON + '<span>Смотреть из Plex</span></div>');
        _plexButtonHash = Lampa.Utils.hash(probe.clone().removeClass('focus').prop('outerHTML'));
        return _plexButtonHash;
    }

    function initFullCardHook() {
        Lampa.Listener.follow('full', function (e) {
            if (e.type !== 'complite') return;
            if (!isConfigured() || !e.data || !e.data.id || !e.object) return;

            var method = e.object.method === 'tv' ? 'tv' : 'movie';
            var match = _plexTmdbIndex[method + ':' + e.data.id];

            if (match) injectPlexButton(e, match, method);
            else restorePlexPriorityIfNeeded();
        });
    }

    // Автозакрепление «Смотреть из Plex» через штатный механизм Lampa
    // (Storage 'full_btn_priority' + native onGroupButtons в buttons.js),
    // с сохранением и восстановлением того, что было закреплено раньше
    // (или ничего) — для карточек, которых нет в Plex.
    function pinPlexAsDefaultSource() {
        var hash = plexButtonHash();
        var current = Lampa.Storage.get('full_btn_priority', '') + '';
        if (current !== hash) Lampa.Storage.set('plex_prev_btn_priority', current);
        Lampa.Storage.set('full_btn_priority', hash);
    }

    function restorePlexPriorityIfNeeded() {
        var hash = plexButtonHash();
        var current = Lampa.Storage.get('full_btn_priority', '') + '';
        if (current !== hash) return; // закреплено не нами — не трогаем
        Lampa.Storage.set('full_btn_priority', Lampa.Storage.get('plex_prev_btn_priority', '') + '');
    }

    // Вставляем кнопку в .buttons--container — тот же контейнер источников,
    // откуда меню «Смотреть» берёт «Торренты»/«Онлайн» (по образцу addAtButton
    // из LampaTrakt: full-start__button selector + jQuery hover:enter). Затем
    // закрепляем её штатным механизмом Lampa (см. pinPlexAsDefaultSource) —
    // порядок важен: это должно случиться синхронно, до того как компонент
    // full/start.js вызовет emit('groupButtons') сразу после события 'complite'.
    function injectPlexButton(e, match, method) {
        var root = e.object.activity && typeof e.object.activity.render === 'function' ? e.object.activity.render() : null;
        if (!root) return;

        if (!root.find('.plex-watch-btn').length) {
            var btnsContainer = root.find('.buttons--container');
            if (!btnsContainer.length) return;

            var btn = $('<div class="full-start__button selector plex-watch-btn">' + PLEX_PLAY_ICON + '<span>Смотреть из Plex</span></div>');

            btn.on('hover:enter', function () {
                if (method === 'tv') {
                    var loader = showPlexLoader();
                    Api.metadata(match.ratingKey).then(function (meta) {
                        if (loader.cancelled) return;
                        hidePlexLoader();
                        openSeasonPicker(meta);
                    }).catch(function () {
                        if (loader.cancelled) return;
                        hidePlexLoader();
                        Lampa.Noty.show('Не удалось получить данные Plex');
                    });
                } else {
                    playRatingKey(match.ratingKey, e.data, { type: 'movie', tmdb: e.data.id });
                }
            });

            // Просто добавляем в скрытый .buttons--container. Дальше всё делает
            // штатная Lampa: onGroupButtons клонирует закреплённую кнопку в
            // видимый .full-start-new__buttons и сама настраивает навигацию/фокус
            // (Controller.collectionSet+collectionFocus в Start.toggle). Нельзя
            // вызывать здесь свой collectionSet — он выполнится ПОСЛЕ штатного и
            // сбросит коллекцию без восстановления фокуса, из-за чего на Apple TV
            // пропадала подсветка навигацией.
            btnsContainer.append(btn);
        }

        pinPlexAsDefaultSource();
    }

    // ---------------------------------------------------------------------
    // Стили
    // ---------------------------------------------------------------------

    function injectStyles() {
        $('<style>' +
            '.plex-detail__poster img{width:100%;border-radius:.5em;margin-bottom:1em}' +
            '.plex-detail__title{font-size:1.3em;margin-bottom:.5em}' +
            '.plex-detail__descr{opacity:.75;margin-bottom:1em;white-space:pre-line}' +
            '.plex-device-auth{text-align:center}' +
            '.plex-device-auth__qr img{width:220px;height:220px;margin:0 auto 1em;border-radius:.5em}' +
            '.plex-device-auth__code{font-size:1.4em;letter-spacing:.15em}' +
            '.full-start__button.plex-watch-btn svg{width:1.4em;height:1.4em}' +
            // Строка фильтров — 1:1 стилевая копия .trakt-watchlist-hub__sorts из
            // LampaTrakt (flex:1 1 0 + min-width:0 держит все кнопки в ОДНУ строку,
            // равными долями; принудительно прозрачный фон у нативного
            // .simple-button--filter>div убирает «коробку» у неактивных кнопок,
            // оставляя просто текст). Активная кнопка/фокус — в цвете Plex (золото
            // #e5a00d) вместо фиолетового Trakt.
            '.plex-hub{display:flex;flex-direction:column;height:100%}' +
            '.plex-hub__controls{padding:.8em 1.5em .2em}' +
            // Ключевые нейтрализации родных стилей Lampa (как у LampaTrakt):
            // margin:0 гасит .simple-button{margin-right:1em} (иначе 5 кнопок
            // теряют ~четверть строки на пустые поля), высота auto гасит
            // height:2.8em, а размер подписи наследует родной
            // .simple-button--filter>div{font-size:.7em} — НЕ переопределять
            // крупнее, именно из-за этого текст не влезал в одну строку.
            '.plex-hub__filters{display:flex;flex-wrap:nowrap;align-items:center;gap:.5em}' +
            '.plex-hub__filters .plex-hub__filter{display:flex;justify-content:center;align-items:center;margin:0!important;border-radius:1em;padding:.5em .9em;flex:1 1 auto;min-width:0;height:auto!important;box-sizing:border-box;border-bottom:3px solid transparent;transition:background .2s,border-color .2s}' +
            '.plex-hub__filters .plex-hub__filter .plex-hub__filter-label,.plex-hub__filters .plex-hub__filter.simple-button--filter>div{margin-left:0!important;padding:0!important;background:transparent!important;text-align:center!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis;min-width:0;max-width:100%;line-height:1.2;font-weight:600;font-size:.7em}' +
            '.plex-hub__filters .plex-hub__filter--active{background:rgba(229,160,13,.18)!important;border-bottom:3px solid #e5a00d;box-shadow:inset 0 0 0 1px rgba(229,160,13,.3)}' +
            '.plex-hub__filters .plex-hub__filter.focus,.plex-hub__filters .plex-hub__filter.hover{background-color:rgba(255,255,255,.15)!important;color:#fff!important}' +
            '.plex-hub__body{flex:1;min-height:0}' +
            '.plex-loading-overlay{position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center}' +
            '.plex-loading-overlay__spinner{width:2.6em;height:2.6em;border-radius:50%;border:.25em solid rgba(255,255,255,.25);border-top-color:#e5a00d;-webkit-animation:plex-spin .8s linear infinite;animation:plex-spin .8s linear infinite}' +
            '@-webkit-keyframes plex-spin{from{-webkit-transform:rotate(0deg)}to{-webkit-transform:rotate(360deg)}}' +
            '@keyframes plex-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}' +
            '</style>').appendTo('head');
    }

    // ---------------------------------------------------------------------
    // Инициализация
    // ---------------------------------------------------------------------

    function init() {
        injectStyles();
        initSettings();
        initMenu();
        initFullCardHook();
        initTimelineSync();
        setTimeout(autoRebuildTmdbIndexOnStart, 3000);
        // Досылаем отложенные отметки просмотра в Trakt (те, что не ушли ранее).
        setTimeout(flushTraktQueue, 5000);

        // Показать/скрыть кнопку синхронизации сразу при переключении тумблера,
        // без необходимости выйти из настроек и зайти обратно.
        Lampa.Storage.listener.follow('change', function (e) {
            if (e.name === 'plex_trakt_status_enabled') Lampa.Settings.update();
        });
    }

    if (window.appready) init();
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') init();
        });
    }
})();
