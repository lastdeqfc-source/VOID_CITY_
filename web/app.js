'use strict';

const tg = window.Telegram?.WebApp;

tg?.ready();
tg?.expand();

document.body.classList.add('ready');

function getInitData() {
  return window.Telegram?.WebApp?.initData || '';
}

function authHeaders() {
  const data = getInitData();
  return data ? {'X-Telegram-Init-Data': data} : {};
}

let me = null;
let loading = false;
let lastScreen = 'home';

const cache = new Map();
const inflight = new Map();

/* =========================
   API
========================= */

async function api(path, options = {}, cfg = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const cacheKey = `${method}:${path}`;

  if (method === 'GET' && cfg.cache && cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  if (inflight.has(cacheKey)) {
    return inflight.get(cacheKey);
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    cfg.timeout || 9000
  );

  const headers = {
    'Accept': 'application/json',
    ...authHeaders(),
    ...(options.headers || {})
  };

  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const job = fetch(path, {
    ...options,
    headers,
    signal: controller.signal,
    cache: 'no-store'
  })
    .then(async response => {
      const type = response.headers.get('content-type') || '';
      const text = await response.text();

      let data = {};

      if (text && type.includes('application/json')) {
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error('Сервер вернул повреждённый JSON');
        }
      } else if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = {
            detail: text.slice(0, 160)
          };
        }
      }

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error(
            'Открой игру через Telegram'
          );
        }

        throw new Error(
          data.detail ||
          data.message ||
          `Ошибка сервера (${response.status})`
        );
      }

      if (method === 'GET' && cfg.cache) {
        cache.set(cacheKey, data);
      }

      return data;
    })
    .finally(() => {
      clearTimeout(timer);
      inflight.delete(cacheKey);
    });

  inflight.set(cacheKey, job);

  return job;
}

/* =========================
   HELPERS
========================= */

function toast(text) {
  const el = document.getElementById('toast');

  if (!el) return;

  el.textContent = text;
  el.classList.add('show');

  clearTimeout(toast.timer);

  toast.timer = setTimeout(() => {
    el.classList.remove('show');
  }, 1800);
}

function setBusy(button, busy = true) {
  if (!button) return;

  button.disabled = busy;
  button.classList.toggle('busy', busy);
}

function invalidate(prefix = '') {
  for (const key of cache.keys()) {
    if (!prefix || key.includes(prefix)) {
      cache.delete(key);
    }
  }
}

function esc(value = '') {
  return String(value).replace(
    /[&<>"']/g,
    c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c])
  );
}

function card(title, body, cls = '') {
  return `
    <section class="card ${cls}">
      <div class="title">${title}</div>
      ${body}
    </section>
  `;
}

/* =========================
   LOADING
========================= */

async function load(force = false) {
  if (loading) return;

  loading = true;

  try {
    me = await api(
      '/api/me',
      {},
      {cache: !force}
    );

    renderHeader();
    menu();

  } catch (error) {

    document.getElementById('content').innerHTML =
      card(
        '⚠️ Не удалось подключиться',
        `
          <div class="muted">
            ${esc(error.message)}
          </div>

          <button
            class="action full"
            onclick="load(true)"
          >
            Повторить
          </button>
        `
      );

  } finally {
    loading = false;
  }
}

/* =========================
   HEADER
========================= */

function renderHeader() {
  if (!me || !me.player) return;

  const p = me.player;

  const name = document.getElementById('name');
  const avatar = document.getElementById('avatar');
  const lvl = document.getElementById('lvl');
  const xpbar = document.getElementById('xpbar');

  if (name) {
    name.textContent = p.name;
  }

  if (avatar) {
    avatar.textContent = p.avatar;
  }

  if (lvl) {
    lvl.textContent =
      `Уровень ${p.level} · ${p.coins} 🪙 · ⚡ ${p.energy}`;
  }

  if (xpbar) {
    const need =
      100 + (p.level - 1) * 75;

    xpbar.style.width =
      Math.min(
        100,
        (p.xp / need) * 100
      ) + '%';
  }
}

/* =========================
   BOTTOM NAVIGATION
========================= */

function renderTabNav(active = 'home') {
  document
    .querySelectorAll('.bottom-nav')
    .forEach(el => el.remove());

  const nav = document.createElement('nav');

  nav.className = 'bottom-nav';

  const tabs = [
    ['home', '🏠', 'Главная'],
    ['quests', '📋', 'Задания'],
    ['games', '🎮', 'Игры'],
    ['shop', '🛒', 'Магазин'],
    ['story', '📖', 'История']
  ];

  nav.innerHTML = tabs.map(
    ([id, icon, title]) => `
      <button
        class="nav-tab ${active === id ? 'active' : ''}"
        onclick="openTab('${id}')"
      >
        <span class="nav-icon">${icon}</span>
        <span class="nav-title">${title}</span>
      </button>
    `
  ).join('');

  document.body.appendChild(nav);
}

function openTab(tab) {
  if (tab === 'home') {
    menu();
    return;
  }

  if (tab === 'quests') {
    questsScreen();
    return;
  }

  if (tab === 'games') {
    gamesScreen();
    return;
  }

  if (tab === 'shop') {
    shopScreen();
    return;
  }

  if (tab === 'story') {
    story();
    return;
  }
}

/* =========================
   HOME
========================= */

function menu() {
  lastScreen = 'home';

  renderTabNav('home');

  const p = me?.player || {};

  document.getElementById('content').innerHTML = `

    <section class="home-hero">

      <h2>
        🌆 VOID CITY
      </h2>

      <p class="muted">
        Твой город. Твоя история.
        Твой путь.
      </p>

    </section>

    ${card(
      '⚡ Быстрые действия',
      `
        <div class="quick-grid">

          <button
            class="action"
            onclick="collect(this)"
          >
            ⚡ Собрать
          </button>

          <button
            class="ghost"
            onclick="daily(this)"
          >
            🎁 Награда
          </button>

        </div>
      `
    )}

    ${card(
      '🏙️ Город',
      `
        <div class="menu-list">

          <button
            class="menu-card"
            onclick="openScreen('city')"
          >
            <span class="menu-icon">🏙️</span>

            <span>
              <b>Город</b>
              <small>
                Развивай здания и собирай ресурсы
              </small>
            </span>

            <span class="arrow">›</span>
          </button>

          <button
            class="menu-card"
            onclick="openScreen('map')"
          >
            <span class="menu-icon">🗺️</span>

            <span>
              <b>Карта</b>
              <small>
                Исследуй районы города
              </small>
            </span>

            <span class="arrow">›</span>
          </button>

          <button
            class="menu-card"
            onclick="openScreen('character')"
          >
            <span class="menu-icon">🧑‍🎨</span>

            <span>
              <b>Персонаж</b>
              <small>
                Аватар и внешний стиль
              </small>
            </span>

            <span class="arrow">›</span>
          </button>

          <button
            class="menu-card"
            onclick="openScreen('inventory')"
          >
            <span class="menu-icon">🎒</span>

            <span>
              <b>Инвентарь</b>
              <small>
                Предметы и ресурсы
              </small>
            </span>

            <span class="arrow">›</span>
          </button>

        </div>
      `
    )}

    ${card(
      '👥 Сообщество',
      `
        <div class="menu-list">

          <button
            class="menu-card"
            onclick="openScreen('clan')"
          >
            <span class="menu-icon">👥</span>

            <span>
              <b>Кланы</b>
              <small>
                Играй вместе с другими
              </small>
            </span>

            <span class="arrow">›</span>
          </button>

          <button
            class="menu-card"
            onclick="openScreen('collections')"
          >
            <span class="menu-icon">🧩</span>

            <span>
              <b>Коллекции</b>
              <small>
                Собирай предметы города
              </small>
            </span>

            <span class="arrow">›</span>
          </button>

          <button
            class="menu-card"
            onclick="openScreen('achievements')"
          >
            <span class="menu-icon">🏆</span>

            <span>
              <b>Достижения</b>
              <small>
                Открывай награды за прогресс
              </small>
            </span>

            <span class="arrow">›</span>
          </button>

        </div>
      `
    )}

    ${card(
      '👤 Профиль',
      `
        <div class="menu-list">

          <button
            class="menu-card"
            onclick="openScreen('profile')"
          >
            <span class="menu-icon">👤</span>

            <span>
              <b>${esc(p.name || 'Профиль')}</b>
              <small>
                Статистика и настройки профиля
              </small>
            </span>

            <span class="arrow">›</span>
          </button>

          <button
            class="menu-card"
            onclick="openScreen('news')"
          >
            <span class="menu-icon">📰</span>

            <span>
              <b>Новости</b>
              <small>
                События VOID CITY
              </small>
            </span>

            <span class="arrow">›</span>
          </button>

          <button
            class="menu-card"
            onclick="openScreen('help')"
          >
            <span class="menu-icon">❓</span>

            <span>
              <b>Помощь</b>
              <small>
                Как работает игра
              </small>
            </span>

            <span class="arrow">›</span>
          </button>

          <button
            class="menu-card"
            onclick="openScreen('settings')"
          >
            <span class="menu-icon">⚙️</span>

            <span>
              <b>Настройки</b>
              <small>
                Настройки интерфейса
              </small>
            </span>

            <span class="arrow">›</span>
          </button>

        </div>
      `
    )}

  `;
}

/* =========================
   INTERNAL SCREENS
========================= */

function openScreen(screen) {
  lastScreen = screen;

  const screens = {
    city,
    map,
    character,
    inventory,
    property,
    arena,
    clan,
    collections,
    achievements,
    newsScreen,
    profile,
    help,
    settings
  };

  if (screens[screen]) {
    screens[screen]();
  } else {
    menu();
  }
}

function back() {
  menu();

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

function head(title) {
  return `
    <div class="screen-topbar">

      <button
        class="back"
        onclick="back()"
      >
        ← Назад
      </button>

      <div class="screen-title">
        ${title}
      </div>

    </div>

    ${card(
      '',
      `
        <div id="screen-body">
          <div class="skeleton"></div>
          <div class="skeleton short"></div>
        </div>
      `,
      'screen-card'
    )}
  `;
}

function icon(kind) {
  return {
    factory: '🏭',
    lab: '🧪',
    market: '🏪'
  }[kind] || '🏢';
}

function label(kind) {
  return {
    factory: 'Фабрика',
    lab: 'Лаборатория',
    market: 'Рынок'
  }[kind] || kind;
}

/* =========================
   CITY
========================= */

function city() {
  document.getElementById('content').innerHTML =
    head('🏙️ Город');

  const buildings = me?.buildings || [];

  document.getElementById('screen-body').innerHTML = `

    <div class="grid">

      ${
        buildings.length
          ? buildings.map(
              building => `
                <div class="item">

                  <b>
                    ${icon(building.kind)}
                    ${label(building.kind)}
                  </b>

                  <div class="muted">
                    Уровень ${building.level}
                  </div>

                  <button
                    class="action full"
                    onclick="upgrade(
                      '${esc(building.kind)}',
                      this
                    )"
                  >
                    Улучшить ·
                    ${150 * building.level}
                    🪙
                  </button>

                </div>
              `
            ).join('')
          : `
            <div class="item">
              <b>🏙️ Город создаётся</b>
              <div class="muted">
                Здания появятся после загрузки данных.
              </div>
            </div>
          `
      }

    </div>

    <div class="quick-grid">

      <button
        class="action"
        onclick="collect(this)"
      >
        ⚡ Собрать
      </button>

      <button
        class="ghost"
        onclick="daily(this)"
      >
        🎁 Награда
      </button>

    </div>
  `;
}

/* =========================
   MAP
========================= */

function map() {
  document.getElementById('content').innerHTML =
    head('🗺️ Карта');

  const places = [
    ['🌃', 'Ночной район', true],
    ['🏭', 'Промзона', false],
    ['🏟️', 'Арена', false],
    ['🕵️', 'Тайный сектор', false],
    ['🏠', 'Квартира', false],
    ['🚗', 'Гараж', false]
  ];

  document.getElementById('screen-body').innerHTML = `
    <div class="map-grid">

      ${places.map(
        ([emoji, name, open]) => `
          <div class="map-tile ${open ? '' : 'locked'}">

            <b>
              ${emoji} ${name}
            </b>

            <small>
              ${open ? '✓ Открыт' : '🔒 Скоро доступно'}
            </small>

          </div>
        `
      ).join('')}

    </div>
  `;
}

/* =========================
   STORY
========================= */

function story() {
  lastScreen = 'story';

  renderTabNav('story');

  document.getElementById('content').innerHTML = `

    <div class="screen-topbar">

      <button
        class="back"
        onclick="menu()"
      >
        ← Назад
      </button>

      <div class="screen-title">
        📖 История
      </div>

    </div>

    ${card(
      'Глава 1 · Первый сигнал',
      `
        <div class="story">

          <b>
            00:17 — неизвестный сигнал
          </b>

          <p class="muted">
            Город давно погрузился в ночь.
            Большинство районов молчит,
            но старый терминал внезапно
            оживает.
          </p>

          <p class="muted">
            На экране появляется сообщение:
            «Если ты видишь это —
            значит, сигнал дошёл».
          </p>

          <button
            class="action full"
            onclick="toast('Продолжение истории скоро откроется')"
          >
            Продолжить
          </button>

        </div>
      `
    )}

    ${card(
      '🔒 Следующая глава',
      `
        <div class="item">

          <b>
            Глава 2 · След в городе
          </b>

          <p class="muted">
            Новая глава будет открыта
            в следующем обновлении.
          </p>

        </div>
      `
    )}

  `;
}

/* =========================
   CHARACTER
========================= */

function character() {
  document.getElementById('content').innerHTML =
    head('🧑‍🎨 Персонаж');

  const avatars = [
    '🌑',
    '🕶️',
    '🧢',
    '🎧',
    '🧥',
    '🧤',
    '👾',
    '🦾'
  ];

  document.getElementById('screen-body').innerHTML = `

    <div class="character-preview">
      ${esc(me.player.avatar)}
    </div>

    <div class="muted" style="text-align:center;margin-bottom:14px">
      Выбери аватар
    </div>

    <div class="avatar-grid">

      ${avatars.map(
        avatar => `
          <button
            onclick="saveAvatar('${avatar}')"
          >
            ${avatar}
          </button>
        `
      ).join('')}

    </div>

  `;
}

/* =========================
   INVENTORY
========================= */

function inventory() {
  document.getElementById('content').innerHTML =
    head('🎒 Инвентарь');

  const items = me?.inventory || [];

  document.getElementById('screen-body').innerHTML =
    items.length
      ? items.map(
          item => `
            <div class="row item">

              <span>
                ${esc(item.item)}
              </span>

              <b>
                ${item.amount}
              </b>

            </div>
          `
        ).join('')
      : `
        <div class="item">
          <b>🎒 Пусто</b>

          <p class="muted">
            Предметы появятся по мере прохождения игры.
          </p>
        </div>
      `;
}

/* =========================
   PROPERTY
========================= */

function property() {
  document.getElementById('content').innerHTML =
    head('🏢 Недвижимость');

  document.getElementById('screen-body').innerHTML = `

    <div class="item">

      <b>🏠 Квартира</b>

      <p class="muted">
        Личное пространство.
        Декор и новые комнаты будут
        открываться по мере развития.
      </p>

    </div>

    ${(me.buildings || []).map(
      building => `
        <div class="item">

          <b>
            ${icon(building.kind)}
            ${label(building.kind)}
          </b>

          <span class="tag">
            ур. ${building.level}
          </span>

        </div>
      `
    ).join('')}

  `;
}

/* =========================
   ARENA
========================= */

function arena() {
  document.getElementById('content').innerHTML =
    head('⚔️ Арена');

  document.getElementById('screen-body').innerHTML = `

    <div class="item">

      <b>
        Тренировочный бой
      </b>

      <p class="muted">
        Без ставок и потери предметов.
        Только тренировочный режим.
      </p>

      <p class="muted">
        Награда:
        +35 🪙 и +25 XP
      </p>

      <button
        class="action"
        onclick="pvp(this)"
      >
        Начать тренировку
      </button>

    </div>

  `;
}

/* =========================
   CLAN
========================= */

function clan() {
  document.getElementById('content').innerHTML =
    head('👥 Кланы');

  document.getElementById('screen-body').innerHTML = `

    <div class="item">

      <b>
        ${
          me.clan
            ? `Ты в клане «${esc(me.clan)}»`
            : 'У тебя пока нет клана.'
        }
      </b>

      <p class="muted">
        Объединяйся с игроками
        и участвуй в общих событиях.
      </p>

      <button
        class="action"
        onclick="createClan(this)"
      >
        Создать клан
      </button>

    </div>

  `;
}

/* =========================
   COLLECTIONS
========================= */

function collections() {
  document.getElementById('content').innerHTML =
    head('🧩 Коллекции');

  const collections = [
    '🏙️ Районы',
    '🚗 Транспорт',
    '👕 Стиль',
    '📡 Артефакты'
  ];

  document.getElementById('screen-body').innerHTML = `

    <div class="collection-grid">

      ${collections.map(
        item => `
          <div class="map-tile">

            <b>
              ${item}
            </b>

            <small>
              0 собрано
    
