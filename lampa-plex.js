/**
 * Lampa-Plex — медиатека личного Plex-сервера внутри Lampa.
 * Показывает библиотеки Plex (фильмы/сериалы) и запускает Direct Play через Lampa.Player,
 * с автоматической передачей во внешний плеер, если так настроено в самой Lampa.
 */
(function () {
    'use strict';

    if (window.plex_plugin_ready) return;
    window.plex_plugin_ready = true;

    var PLUGIN_VERSION = '1.0.0';
    var PLEX_TV = 'https://plex.tv';
    var PLEX_PRODUCT = 'Lampa Plex';

    var PLEX_ICON = '<svg class="plex-brand-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">' +
        '<path fill="currentColor" d="M3.987 8.409c-.96 0-1.587.28-2.12.933v-.72H0v8.88s.038.018.127.037c.138.03.821.187 1.331-.249.441-.377.542-.814.542-1.318v-1.283c.533.573 1.147.813 2 .813 1.84 0 3.253-1.493 3.253-3.48 0-2.12-1.36-3.613-3.266-3.613Zm16.748 5.595.406.591c.391.614.894.906 1.492.908.621-.012 1.064-.562 1.226-.755 0 0-.307-.27-.686-.72-.517-.614-1.214-1.755-1.24-1.803l-1.198 1.779Zm-3.205-1.955c0-2.08-1.52-3.64-3.52-3.64s-3.467 1.587-3.467 3.573a3.48 3.48 0 0 0 3.507 3.52c1.413 0 2.626-.84 3.253-2.293h-2.04l-.093.093c-.427.4-.72.533-1.227.533-.787 0-1.373-.506-1.453-1.266h4.986c.04-.214.054-.307.054-.52Zm-7.671-.219c0 .769.11 1.701.868 2.722l.056.069c-.306.526-.742.88-1.248.88-.399 0-.814-.211-1.138-.579a2.177 2.177 0 0 1-.538-1.441V6.409H9.86l-.001 5.421Zm9.283 3.46h-2.39l2.247-3.332-2.247-3.335h2.39l2.248 3.335-2.248 3.332Zm1.593-1.286Zm-17.162-.342c-.933 0-1.68-.773-1.68-1.72s.76-1.666 1.68-1.666c.92 0 1.68.733 1.68 1.68 0 .946-.733 1.706-1.68 1.706Zm18.361-1.974L24 8.622h-2.391l-.87 1.293 1.195 1.773Zm-9.404-.466c.16-.706.72-1.133 1.493-1.133.773 0 1.373.467 1.507 1.133h-3Z"/>' +
        '</svg>';

    var ICON_MENU = PLEX_ICON;
    var ICON_SETTINGS = PLEX_ICON;

    // Значок для кнопки "Смотреть в Plex" — крупная стрелка-play из официального
    // app-иконки Plex (dashboard-icons: rounded square #282a2d + arrow #e5a00d),
    // здесь монолинейно, только сама стрелка, currentColor — чтобы наследовать
    // цвет темы/фокуса как остальные значки Lampa, без второго жёсткого цвета.
    // Белая обводка по краю — фиксированный цвет (не currentColor), чтобы форма
    // всегда читалась чётким контуром независимо от того, в какой цвет
    // окрасится заливка.
    var PLEX_PLAY_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none" aria-hidden="true" focusable="false">' +
        '<path fill="currentColor" stroke="#fff" stroke-width="20" stroke-linejoin="round" d="M256 70H148l108 186-108 186h108l108-186z"/>' +
        '</svg>';

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
            'X-Plex-Platform': 'Lampa'
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

            return plexRequest(path, params).then(function (mc) {
                var items = mc.Metadata || [];
                return { items: items, totalSize: mc.totalSize || mc.size || items.length };
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
        }
    };

    // ---------------------------------------------------------------------
    // Индекс медиатеки: tmdbId → Plex ratingKey (для кнопки на родной карточке
    // независимо от того, как пользователь до неё дошёл)
    // ---------------------------------------------------------------------

    var _plexTmdbIndex = getStoredTmdbIndex();
    var _tmdbIndexRebuildInProgress = false;

    // Те же правила, что и у «Медиатека Plex»: если пользователь ни разу не
    // открывал «Выбрать библиотеки», getSections() пуст — в этом случае
    // берём все доступные секции сервера, а не пропускаем сборку индекса.
    function resolveActiveSectionKeys() {
        var picked = getSections();
        if (picked.length) return Promise.resolve(picked);
        return Api.sections().then(function (all) { return all.map(function (s) { return s.key; }); });
    }

    function fetchAllSectionItems(sectionKey, onPage) {
        var pageSize = 200;

        function step(start) {
            return Api.list(sectionKey, { start: start, size: pageSize }).then(function (data) {
                onPage(data.items);
                var next = start + pageSize;
                if (data.items.length && next < data.totalSize) return step(next);
            });
        }

        return step(0);
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
                    return fetchAllSectionItems(sectionKey, function (items) {
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
                    title: 'Библиотеки Plex',
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
        }).catch(function () { Lampa.Noty.show('Не удалось получить список библиотек Plex'); });
    }

    function resetSettings() {
        restorePlexPriorityIfNeeded();
        ['plex_server_url', 'plex_token', 'plex_sections_selected', 'plex_sync_enabled', 'plex_tmdb_index', 'plex_tmdb_index_updated_at', 'plex_prev_btn_priority'].forEach(function (k) {
            Lampa.Storage.set(k, '');
        });
        _plexTmdbIndex = {};
        Lampa.Noty.show('Настройки Plex сброшены');
        Lampa.Settings.update();
    }

    // ---------------------------------------------------------------------
    // Настройки плагина
    // ---------------------------------------------------------------------

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
            onRender: function (item) { item.find('.settings-param__value').remove(); }
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

        sectionHeader('plex_libraries_section', 'Библиотеки');

        Lampa.SettingsApi.addParam({
            component: 'plex',
            param: { name: 'plex_pick_sections', type: 'button' },
            field: { name: 'Выбрать библиотеки', description: 'Какие разделы Plex показывать в «Медиатеке Plex»' },
            onChange: function () { pickSections(); }
        });

        Lampa.SettingsApi.addParam({
            component: 'plex',
            param: { name: 'plex_rebuild_index', type: 'button' },
            field: { name: 'Обновить кэш медиатеки', description: 'Нужен, чтобы кнопка «Смотреть в Plex» показывалась на любой карточке фильма/сериала, а не только после захода в «Медиатеку Plex»' },
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

        sectionHeader('plex_playback_section', 'Воспроизведение');

        Lampa.SettingsApi.addParam({
            component: 'plex',
            param: { name: 'plex_sync_enabled', type: 'trigger', default: true },
            field: { name: 'Отслеживать просмотр в Plex', description: 'Отправлять позицию и статус просмотра на сервер Plex (Direct Play; транскодирование не поддерживается)' }
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
        Lampa.Menu.addButton(ICON_MENU, 'Медиатека Plex', function () { openLibrary(); });
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
                Lampa.Noty.show('Не выбраны библиотеки Plex в настройках');
                Lampa.Controller.toggle('settings');
                Lampa.Settings.create('plex');
                return;
            }

            if (chosen.length === 1) return openSectionMenu(chosen[0]);

            Lampa.Select.show({
                title: 'Медиатека Plex',
                items: chosen.map(function (s) { return { title: s.title, section: s }; }),
                onSelect: function (a) { openSectionMenu(a.section); },
                onBack: function () { Lampa.Controller.toggle('menu'); }
            });
        }).catch(function () { Lampa.Noty.show('Не удалось подключиться к Plex'); });
    }

    function openSectionMenu(section) {
        Lampa.Select.show({
            title: section.title,
            items: [
                { title: 'Открыть библиотеку', action: 'browse' },
                { title: 'Поиск', action: 'search' }
            ],
            onSelect: function (a) {
                if (a.action === 'search') {
                    Lampa.Input.edit({ title: 'Поиск: ' + section.title, value: '', free: true, nosave: true }, function (q) {
                        if (q) openSection(section, q);
                    });
                } else {
                    openSection(section);
                }
            },
            onBack: function () { Lampa.Controller.toggle('menu'); }
        });
    }

    function openSection(section, query) {
        Lampa.Activity.push({
            component: 'plex_library',
            title: query ? (section.title + ': ' + query) : section.title,
            plex_section: section.key,
            plex_type: section.type,
            plex_query: query || ''
        });
    }

    // ---------------------------------------------------------------------
    // Карточка → hybrid-роутинг (родная карточка TMDB либо своя модалка)
    // ---------------------------------------------------------------------

    function toCard(item, object) {
        var tmdbId = findTmdbId(item);
        var poster = item.thumb ? plexUrl(item.thumb) : '';
        var backdrop = item.art ? plexUrl(item.art) : poster;
        var method = object.plex_type === 'show' ? 'tv' : 'movie';

        var base = {
            title: item.title,
            original_title: item.title,
            release_date: item.year ? String(item.year) : '',
            vote_average: Number(item.rating || item.audienceRating || 0),
            poster: poster,
            image: backdrop,
            img: poster,
            plex_rating_key: item.ratingKey,
            plex_section: object.plex_section,
            plex_type: object.plex_type
        };

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

            var html = $(
                '<div class="about plex-detail">' +
                (poster ? '<div class="plex-detail__poster"><img src="' + poster + '"></div>' : '') +
                '<div class="about__text plex-detail__title"><strong>' + escapeHtml(meta.title || '') +
                (meta.year ? ' (' + meta.year + ')' : '') + '</strong></div>' +
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
        }).catch(function () { Lampa.Noty.show('Не удалось получить данные Plex'); });
    }

    function openSeasonPicker(showMeta) {
        Api.children(showMeta.ratingKey).then(function (children) {
            var seasons = children.filter(function (s) { return s.type === 'season'; });
            if (!seasons.length) { Lampa.Noty.show('Сезоны не найдены'); return; }
            Lampa.Select.show({
                title: showMeta.title,
                items: seasons.map(function (s) { return { title: s.title || ('Сезон ' + s.index), s: s }; }),
                onSelect: function (a) { openEpisodePicker(showMeta, a.s); },
                onBack: function () { Lampa.Controller.toggle('content'); }
            });
        }).catch(function () { Lampa.Noty.show('Не удалось получить сезоны'); });
    }

    function openEpisodePicker(showMeta, season) {
        Api.children(season.ratingKey).then(function (children) {
            var episodes = children.filter(function (e) { return e.type === 'episode'; });
            if (!episodes.length) { Lampa.Noty.show('Серии не найдены'); return; }
            Lampa.Select.show({
                title: season.title || ('Сезон ' + season.index),
                items: episodes.map(function (e) {
                    var watched = e.viewCount > 0;
                    var progress = (e.viewOffset && e.duration) ? Math.round(e.viewOffset / e.duration * 100) : 0;
                    return {
                        title: e.index + '. ' + (e.title || ''),
                        subtitle: watched ? 'Просмотрено' : (progress ? progress + '%' : ''),
                        e: e
                    };
                }),
                onSelect: function (a) {
                    var idx = episodes.indexOf(a.e);
                    playEpisode(a.e, showMeta, episodes.slice(idx + 1));
                },
                onBack: function () { openSeasonPicker(showMeta); }
            });
        }).catch(function () { Lampa.Noty.show('Не удалось получить серии'); });
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

    function playMeta(meta, cardData, playlistMetas) {
        var media = meta.Media && meta.Media[0];
        var part = media && media.Part && media.Part[0];

        if (!part) { Lampa.Noty.show('Не найден файл для воспроизведения (нужен Direct Play — транскодирование не поддерживается)'); return; }

        var hash = timelineHash(meta.ratingKey);
        var duration = (meta.duration || media.duration || 0) / 1000;
        var viewOffset = (meta.viewOffset || 0) / 1000;
        var percent = duration ? Math.min(100, Math.round(viewOffset / duration * 100)) : 0;

        Lampa.Timeline.update({ hash: hash, time: viewOffset, duration: duration, percent: percent });

        var subtitles = buildSubtitles(part);

        var playData = {
            url: plexUrl(part.key),
            title: meta.grandparentTitle ? (meta.grandparentTitle + ' - ' + meta.title) : meta.title,
            card: cardData,
            timeline: Lampa.Timeline.view(hash)
        };

        if (subtitles.length) playData.subtitles = subtitles;

        if (playlistMetas && playlistMetas.length) {
            var playlist = playlistMetas.map(function (m) {
                var mi = m.Media && m.Media[0];
                var mp = mi && mi.Part && mi.Part[0];
                return mp ? { title: m.title, url: plexUrl(mp.key) } : null;
            }).filter(Boolean);
            if (playlist.length) playData.playlist = playlist;
        }

        _activePlexPlayback = { ratingKey: meta.ratingKey, duration: duration };

        Lampa.Player.play(playData);
    }

    function playRatingKey(ratingKey, cardData) {
        Api.metadata(ratingKey).then(function (meta) { playMeta(meta, cardData); })
            .catch(function () { Lampa.Noty.show('Не удалось получить данные для воспроизведения'); });
    }

    function playEpisode(episodeStub, showMeta, nextEpisodeStubs) {
        Api.metadata(episodeStub.ratingKey).then(function (meta) {
            var poster = meta.thumb ? plexUrl(meta.thumb) : (showMeta.thumb ? plexUrl(showMeta.thumb) : '');
            var cardData = { title: showMeta.title + ' - ' + meta.title, img: poster };

            var upcoming = (nextEpisodeStubs || []).slice(0, 5);
            if (upcoming.length) {
                Promise.all(upcoming.map(function (e) { return Api.metadata(e.ratingKey).catch(function () { return null; }); }))
                    .then(function (metas) { playMeta(meta, cardData, metas.filter(Boolean)); });
            } else {
                playMeta(meta, cardData);
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

            var hash = timelineHash(info.ratingKey);
            var road = Lampa.Timeline.view(hash);
            reportProgressToPlex(info.ratingKey, road.time, road.duration || info.duration);
        });
    }

    // ---------------------------------------------------------------------
    // Компонент "Медиатека Plex" (сетка карточек секции)
    // ---------------------------------------------------------------------

    Lampa.Component.add('plex_library', function (object) {
        var comp = Lampa.Maker.make('Category', object);
        var page = 1;
        var totalPages = 1;
        var pageSize = 50;

        function fetchPage(pageNum, resolve, reject) {
            Api.list(object.plex_section, {
                start: (pageNum - 1) * pageSize,
                size: pageSize,
                query: object.plex_query || ''
            }).then(function (data) {
                totalPages = Math.max(1, Math.ceil(data.totalSize / pageSize));
                var results = data.items.map(function (item) { return toCard(item, object); });
                resolve({ results: results, total_pages: totalPages, page: pageNum });
            }).catch(function () { reject(); });
        }

        comp.use({
            onCreate: function () {
                page = 1;
                fetchPage(page, this.build.bind(this), this.empty.bind(this));
            },
            onNext: function (resolve, reject) {
                if (page >= totalPages) { reject.call(this); return; }
                page++;
                fetchPage(page, resolve, reject);
            },
            onInstance: function (card, element) {
                card.use({
                    onEnter: function () { onCardEnter(element); },
                    onFocus: function () { Lampa.Background.change(Lampa.Utils.cardImgBackground(element)); }
                });
            }
        });

        return comp;
    });

    // ---------------------------------------------------------------------
    // Гибридная интеграция с родной карточкой (кнопка "Смотреть в Plex")
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
        var probe = $('<div class="full-start__button selector plex-watch-btn">' + PLEX_PLAY_ICON + '<span>Смотреть в Plex</span></div>');
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

    // Автозакрепление «Смотреть в Plex» через штатный механизм Lampa
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

            var btn = $('<div class="full-start__button selector plex-watch-btn">' + PLEX_PLAY_ICON + '<span>Смотреть в Plex</span></div>');

            btn.on('hover:enter', function () {
                if (method === 'tv') {
                    Api.metadata(match.ratingKey).then(function (meta) { openSeasonPicker(meta); })
                        .catch(function () { Lampa.Noty.show('Не удалось получить данные Plex'); });
                } else {
                    playRatingKey(match.ratingKey, e.data);
                }
            });

            btnsContainer.append(btn);

            setTimeout(function () { try { Lampa.Controller.collectionSet(root); } catch (err) {} }, 0);
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
            '.full-start__button.plex-watch-btn .plex-brand-icon{width:1em;height:1em}' +
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
    }

    if (window.appready) init();
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') init();
        });
    }
})();
