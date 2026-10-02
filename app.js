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
    .then(async r => {
      const type = r.headers.get('content-type') || '';
      const text = await r.text();

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
          data = {detail: text.slice(0, 160)};
        }
      }

      if (!r.ok) {
        if (r.status === 401) {
          throw new Error(
            'Telegram не передал данные сессии. Закрой Mini App и открой его заново через Telegram.'
          );
        }

        throw new Error(
          data.detail ||
          data.message ||
          `Ошибка сервера (${r.status})`
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
  for (const k of cache.keys()) {
    if (!prefix || k.includes(prefix)) {
      cache.delete(k);
    }
  }
}

function card(title, body, cls = '') {
  return `
    <section class="card ${cls}">
      <div class="title">${title}</div>
      ${body}
    </section>
  `;
}

function esc(s = '') {
  return String(s).replace(
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


/* =========================
   LOAD
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

  } catch (e) {

    document.getElementById('content').innerHTML =
      card(
        '⚠️ Не удалось подключиться',
        `
          <div class="muted">${esc(e.message)}</div>

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
  const p = me.player;

  document.getElementById('name').textContent = p.name;
  document.getElementById('avatar').textContent = p.avatar;

  document.getElementById('lvl').textContent =
    `Уровень ${p.level} · ${p.coins} 🪙 · ⚡ ${p.energy}`;

  document.getElementById('xpbar').style.width =
    Math.min(
      100,
      p.xp / (100 + (p.level - 1) * 75) * 100
    ) + '%';
}


/* =========================
   BOTTOM NAVIGATION
========================= */

const tabs = [
  ['🏠', 'Главная', 'home'],
  ['📋', 'Задания', 'quests'],
  ['🎮', 'Игры', 'games'],
  ['🛒', 'Магазин', 'shop'],
  ['📖', 'История', 'story']
];

function bottomNav(active = 'home') {

  return `
    <nav class="bottom-nav">

      ${tabs.map(([icon, title, screen]) => `
        <button
          class="nav-tab ${active === screen ? 'active' : ''}"
          onclick="openTab('${screen}')"
        >
          <span class="nav-icon">${icon}</span>
          <span class="nav-title">${title}</span>
        </button>
      `).join('')}

    </nav>
  `;
}

function renderTabNav(active) {

  const old = document.querySelector('.bottom-nav');

  if (old) {
    old.remove();
  }

  document.body.insertAdjacentHTML(
    'beforeend',
    bottomNav(active)
  );
}


/* =========================
   HOME
========================= */

function menu() {

  lastScreen = 'home';

  document.getElementById('content').innerHTML = `

    ${card(
      '🌆 VOID CITY',
      `
        <div class="home-hero">

          <div class="item">
            <b>Добро пожаловать в VOID CITY</b>

            <p class="muted">
              Развивай город, открывай районы,
              собирай коллекции и проходи сюжет.
            </p>
          </div>

        </div>
      `
    )}

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
      '🏙️ Разделы',
      `
        <div class="menu-list">

          <button
            class="menu-card"
            onclick="openScreen('city')"
          >
            <span class="menu-icon">🏙️</span>

            <span>
              <b>Город</b>
              <small>Здания и производство</small>
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
              <small>Районы и новые сектора</small>
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
              <small>Предметы и ресурсы</small>
            </span>

            <span class="arrow">›</span>
          </button>

          <button
            class="menu-card"
            onclick="openScreen('profile')"
          >
            <span class="menu-icon">👤</span>

            <span>
              <b>Профиль</b>
              <small>Статистика и персонаж</small>
            </span>

            <span class="arrow">›</span>
          </button>

        </div>
      `
    )}

  `;

  renderTabNav('home');
}


/* =========================
   TABS
========================= */

function openTab(tab) {

  lastScreen = tab;

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
   INTERNAL NAVIGATION
========================= */

function openScreen(screen) {

  lastScreen = screen;

  const fn = {
    city,
    map,
    story,
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
  }[screen];

  if (fn) {
    fn();
  } else {
    menu();
  }
}


/* НОРМАЛЬНАЯ КНОПКА НАЗАД */

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


/* =========================
   CITY
========================= */

function icon(k) {

  return {
    factory: '🏭',
    lab: '🧪',
    market: '🏪'
  }[k] || '🏢';
}

function label(k) {

  return {
    factory: 'Фабрика',
    lab: 'Лаборатория',
    market: 'Рынок'
  }[k] || k;
}

function city() {

  document.getElementById('content').innerHTML =
    head('🏙️ Город');

  const body = `

    <div class="grid">

      ${me.buildings.map(b => `

        <div class="item">

          <b>
            ${icon(b.kind)}
            ${label(b.kind)}
          </b>

          <div class="muted">
            Уровень ${b.level}
          </div>

          <button
            class="action full"
            onclick="upgrade('${b.kind}',this)"
          >
            Улучшить · ${150 * b.level} 🪙
          </button>

        </div>

      `).join('')}

    </div>

    <div class="quick-grid">

      <button
        class="action"
        onclick="collect(this)"
      >
        ⚡ Собрать производство
      </button>

      <button
        class="ghost"
        onclick="daily(this)"
      >
        🎁 Ежедневная награда
      </button>

    </div>

  `;

  document.getElementById('screen-body').innerHTML = body;
}


/* =========================
   MAP
========================= */

function map() {

  document.getElementById('content').innerHTML =
    head('🗺️ Карта');

  document.getElementById('screen-body').innerHTML = `

    <div class="map-grid">

      ${[
        '🌃 Ночной район',
        '🏭 Промзона',
        '🏟️ Арена',
        '🕵️ Тайный сектор',
        '🏠 Квартира',
        '🚗 Гараж'
      ].map((x, i) => `

        <div class="map-tile ${i > 0 ? 'locked' : ''}">

          <b>${x}</b>

          <small>
            ${i ? '🔒 Скоро доступно' : '✓ Открыт'}
          </small>

        </div>

      `).join('')}

    </div>

  `;
}


/* =========================
   STORY
========================= */

function story() {

  document.getElementById('content').innerHTML =
    head('📖 История');

  document.getElementById('screen-body').innerHTML = `

    <div class="story">

      <div class="item">

        <b>Глава 1 · Первый сигнал</b>

        <p class="muted">
          Город просыпается после долгого отключения.
          На старом терминале появляется неизвестный сигнал.
        </p>

        <button
          class="action"
          onclick="toast('Новая глава скоро будет доступна')"
        >
          Продолжить
        </button>

      </div>

    </div>

  `;

  renderTabNav('story');
}


/* =========================
   QUESTS
========================= */

async function questsScreen() {

  document.getElementById('content').innerHTML =
    head('📋 Задания');

  try {

    const q = await api(
      '/api/quests',
      {},
      {cache: false}
    );

    document.getElementById('screen-body').innerHTML = `

      <div class="list">

        ${
          (q || []).map(x => `

            <div class="item">

              <b>${esc(x.title || x.name || 'Задание')}</b>

              <p class="muted">
                ${esc(x.description || 'Выполни это задание')}
              </p>

            </div>

          `).join('')
          ||
          `
            <div class="muted">
              Новых заданий пока нет.
            </div>
          `
        }

      </div>

    `;

  } catch (e) {

    document.getElementById('screen-body').innerHTML = `
      <div class="muted">
        ${esc(e.message)}
      </div>
    `;
  }

  renderTabNav('quests');
}


/* =========================
   GAMES
========================= */

function gamesScreen() {

  document.getElementById('content').innerHTML =
    head('🎮 Игры');

  document.getElementById('screen-body').innerHTML = `

    <div class="grid">

      <div class="item">

        <b>🧠 Взлом терминала</b>

        <p class="muted">
          Мини-игра на внимательность.
        </p>

        <button
          class="action full"
          onclick="toast('Мини-игра скоро будет доступна')"
        >
          Играть
        </button>

      </div>

      <div class="item">

        <b>📡 Сканер сигналов</b>

        <p class="muted">
          Найди скрытый сигнал города.
        </p>

        <button
          class="action full"
          onclick="toast('Сканер запускается')"
        >
          Запустить
        </button>

      </div>

      <div class="item">

        <b>⚔️ Тренировка</b>

        <p class="muted">
          Тренировочный режим без ставок.
        </p>

        <button
          class="action full"
          onclick="pvp(this)"
        >
          Начать
        </button>

      </div>

    </div>

  `;

  renderTabNav('games');
}


/* =========================
   SHOP
========================= */

function shopScreen() {

  document.getElementById('content').innerHTML =
    head('🛒 Магазин');

  document.getElementById('screen-body').innerHTML = `

    <div class="grid">

      <div class="item">

        <b>🎨 Неоновый стиль</b>

        <p class="muted">
          Косметический предмет.
        </p>

        <button
          class="action full"
          onclick="toast('Магазин предметов скоро будет доступен')"
        >
          Скоро
        </button>

      </div>

      <div class="item">

        <b>👾 Редкий аватар</b>

        <p class="muted">
          Новый внешний вид персонажа.
        </p>

        <button
          class="action full"
          onclick="toast('Предмет скоро появится')"
        >
          Скоро
        </button>

      </div>

      <div class="item">

        <b>🏙️ Декор района</b>

        <p class="muted">
          Косметика для города.
        </p>

        <button
          class="action full"
          onclick="toast('Предмет скоро появится')"
        >
          Скоро
        </button>

      </div>

    </div>

  `;

  renderTabNav('shop');
}


/* =========================
   CHARACTER
========================= */

function character() {

  document.getElementById('content').innerHTML =
    head('🧑‍🎨 Персонаж');

  document.getElementById('screen-body').innerHTML = `

    <div class="character-preview">
      ${esc(me.player.avatar)}
    </div>

    <div class="avatar-grid">

      ${
        [
          '🌑',
          '🕶️',
          '🧢',
          '🎧',
          '🧥',
          '🧤',
          '👾',
          '🦾'
        ].map(a => `

          <button
            onclick="saveAvatar('${a}')"
          >
            ${a}
          </button>

        `).join('')
      }

    </div>

  `;
}


/* =========================
   INVENTORY
========================= */

function inventory() {

  document.getElementById('content').innerHTML =
    head('🎒 Инвентарь');

  document.getElementById('screen-body').innerHTML =

    me.inventory?.map(x => `

      <div class="row item">

        <span>
          ${esc(x.item)}
        </span>

        <b>
          ${x.amount}
        </b>

      </div>

    `).join('')

    ||

    `
      <div class="muted">
        Пока пусто.
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

    ${
      me.buildings.map(b => `

        <div class="item">

          <b>
            ${icon(b.kind)}
            ${label(b.kind)}
          </b>

          <span class="tag">
            ур. ${b.level}
          </span>

        </div>

      `).join('')
    }

  `;
}


/* =========================
   ARENA
========================= */

async function arena() {

  document.getElementById('content').innerHTML =
    head('⚔️ Арена');

  document.getElementById('screen-body').innerHTML = `

    <div class="item">

      <b>Тренировочный бой</b>

      <p class="muted">
        Без ставок и потери предметов.
        За тренировку можно получить игровую награду.
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

async function clan() {

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

  document.getElementById('screen-body').innerHTML = `

    <div class="collection-grid">

      ${[
        '🏙️ Районы',
        '🚗 Транспорт',
        '👕 Стиль',
        '📡 Артефакты'
      ].map(x => `

        <div class="map-tile">

          <b>${x}</b>

          <small>
            0 собрано
          </small>

        </div>

      `).join('')}

    </div>

  `;
}


/* =========================
   ACHIEVEMENTS
========================= */

function achievements() {

  document.getElementById('content').innerHTML =
    head('🏆 Достижения');

  document.getElementById('screen-body').innerHTML = `

    <div class="list">

      ${
        (me.achievements || []).map(x => `

          <div class="item">
            🏅 ${esc(x)}
          </div>

        `).join('')

        ||

        `
          <div class="muted">
            Первые достижения откроются
            после действий в городе.
          </div>
        `
      }

    </div>

  `;
}


/* =========================
   NEWS
========================= */

async function newsScreen() {

  document.getElementById('content').innerHTML =
    head('📰 Новости');

  try {

    const n = await api(
      '/api/news',
      {},
      {cache: true}
    );

    document.getElementById('screen-body').innerHTML =
      n.map(x => `

        <div class="item">

          <b>
            ${esc(x.title)}
          </b>

          <br>

          <span class="muted">
            ${esc(x.text)}
          </span>

        </div>

      `).join('');

  } catch (e) {

    document.getElementById('screen-body').innerHTML =
      `<div class="muted">${esc(e.message)}</div>`;

  }
}


/* =========================
   PROFILE
========================= */

function profile() {

  document.getElementById('content').innerHTML =
    head('👤 Профиль');

  document.getElementById('screen-body').innerHTML = `

    <div class="item">

      <div class="big">

        ${esc(me.player.avatar)}
    
