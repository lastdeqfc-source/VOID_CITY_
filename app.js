'use strict';

const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

document.body.classList.add('ready');
const INIT_DATA = tg?.initData || '';
const BASE_HEADERS = INIT_DATA ? {'X-Telegram-Init-Data': INIT_DATA} : {};
let me = null;
let loading = false;
let lastScreen = 'home';
const cache = new Map();
const inflight = new Map();

async function api(path, options = {}, cfg = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const cacheKey = `${method}:${path}`;
  if (method === 'GET' && cfg.cache && cache.has(cacheKey)) return cache.get(cacheKey);
  if (inflight.has(cacheKey)) return inflight.get(cacheKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeout || 9000);
  const headers = {'Accept':'application/json', ...BASE_HEADERS, ...(options.headers || {})};
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

  const job = fetch(path, {...options, headers, signal: controller.signal, cache:'no-store'})
    .then(async r => {
      const type = r.headers.get('content-type') || '';
      const text = await r.text();
      let data = {};
      if (text && type.includes('application/json')) {
        try { data = JSON.parse(text); } catch { throw new Error('Сервер вернул повреждённый JSON'); }
      } else if (text) {
        try { data = JSON.parse(text); } catch { data = {detail: text.slice(0,160)}; }
      }
      if (!r.ok) {
        if (r.status === 401) throw new Error('Открой игру через кнопку меню Telegram');
        throw new Error(data.detail || data.message || `Ошибка сервера (${r.status})`);
      }
      if (method === 'GET' && cfg.cache) cache.set(cacheKey, data);
      return data;
    })
    .finally(() => { clearTimeout(timer); inflight.delete(cacheKey); });
  inflight.set(cacheKey, job);
  return job;
}

function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text; el.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 1800);
}
function setBusy(button, busy=true) { if (!button) return; button.disabled = busy; button.classList.toggle('busy', busy); }
function invalidate(prefix='') { for (const k of cache.keys()) if (!prefix || k.includes(prefix)) cache.delete(k); }
function card(title, body, cls='') { return `<section class="card ${cls}"><div class="title">${title}</div>${body}</section>`; }
function esc(s='') { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function load(force=false) {
  if (loading) return;
  loading = true;
  try {
    me = await api('/api/me', {}, {cache:!force});
    renderHeader();
    menu();
  } catch (e) {
    document.getElementById('content').innerHTML = card('⚠️ Не удалось подключиться', `<div class="muted">${esc(e.message)}</div><button class="action full" onclick="load(true)">Повторить</button>`);
  } finally { loading = false; }
}

function renderHeader() {
  const p = me.player;
  document.getElementById('name').textContent = p.name;
  document.getElementById('avatar').textContent = p.avatar;
  document.getElementById('lvl').textContent = `Уровень ${p.level} · ${p.coins} 🪙 · ⚡ ${p.energy}`;
  document.getElementById('xpbar').style.width = Math.min(100, p.xp/(100+(p.level-1)*75)*100)+'%';
}

const menuItems = [
  ['🏙️','Город','Развивай здания и собирай доход','city'],
  ['🗺️','Карта','Районы, точки интереса и новые сектора','map'],
  ['📖','Сюжет','Главы истории и городские события','story'],
  ['🧑‍🎨','Собери персонажа','Стиль, аватар и косметика','character'],
  ['🎒','Инвентарь','Ресурсы, предметы и коллекции','inventory'],
  ['🏢','Недвижимость','Квартира, здания и улучшения','property'],
  ['⚔️','Арена','Тренировочные бои без ставок','arena'],
  ['👥','Кланы','Создавай клан и играй вместе','clan'],
  ['🧩','Коллекции','Собирай предметы города','collections'],
  ['🏆','Достижения','Открывай награды за прогресс','achievements'],
  ['📰','Новости','Хроника и события города','news'],
  ['👤','Профиль','Имя, аватар и статистика','profile'],
  ['❓','Помощь','Как работает VOID CITY','help'],
  ['⚙️','Настройки','Настройки интерфейса','settings']
];

function menu() {
  lastScreen='home';
  document.getElementById('content').innerHTML = card('🌆 VOID CITY', `<div class="menu-list">${menuItems.map(([i,t,d,s]) => `<button class="menu-card" onclick="openScreen('${s}')"><span class="menu-icon">${i}</span><span><b>${t}</b><small>${d}</small></span><span class="arrow">›</span></button>`).join('')}</div>`)+card('⚡ Быстрые действия', `<div class="quick-grid"><button class="action" onclick="collect(this)">⚡ Собрать</button><button class="ghost" onclick="daily(this)">🎁 Награда</button></div>`);
}

function openScreen(screen) {
  lastScreen=screen;
  const fn={city, map, story, character, inventory, property, arena, clan, collections, achievements, newsScreen, profile, help, settings}[screen];
  if (fn) fn(); else menu();
}
function back() { menu(); window.scrollTo({top:0,behavior:'smooth'}); }
function head(title) { return `<button class="back" onclick="back()">‹ Назад</button>${card(title,'<div id="screen-body"><div class="skeleton"></div><div class="skeleton short"></div></div>')}`; }
function icon(k){return {factory:'🏭',lab:'🧪',market:'🏪'}[k]||'🏢'}
function label(k){return {factory:'Фабрика',lab:'Лаборатория',market:'Рынок'}[k]||k}

function city(){
  document.getElementById('content').innerHTML=head('🏙️ Город');
  const body=`<div class="grid">${me.buildings.map(b=>`<div class="item"><b>${icon(b.kind)} ${label(b.kind)}</b><div class="muted">Уровень ${b.level}</div><button class="action full" onclick="upgrade('${b.kind}',this)">Улучшить · ${150*b.level} 🪙</button></div>`).join('')}</div><div class="quick-grid"><button class="action" onclick="collect(this)">⚡ Собрать производство</button><button class="ghost" onclick="daily(this)">🎁 Ежедневная награда</button></div>`;
  document.getElementById('screen-body').innerHTML=body;
}
function map(){document.getElementById('content').innerHTML=head('🗺️ Карта');document.getElementById('screen-body').innerHTML=`<div class="map-grid">${['🌃 Ночной район','🏭 Промзона','🏟️ Арена','🕵️ Тайный сектор','🏠 Квартира','🚗 Гараж'].map((x,i)=>`<div class="map-tile ${i>0?'locked':''}"><b>${x}</b><small>${i?'🔒 Скоро доступно':'✓ Открыт'}</small></div>`).join('')}</div>`}
function story(){document.getElementById('content').innerHTML=head('📖 Сюжет');document.getElementById('screen-body').innerHTML=`<div class="story"><b>Глава 1 · Первый сигнал</b><p class="muted">Город просыпается, а на старом терминале появляется неизвестный сигнал.</p><button class="action" onclick="toast('Новая глава скоро будет доступна')">Продолжить</button></div>`}
function character(){document.getElementById('content').innerHTML=head('🧑‍🎨 Собери персонажа');document.getElementById('screen-body').innerHTML=`<div class="character-preview">${esc(me.player.avatar)}</div><div class="avatar-grid">${['🌑','🕶️','🧢','🎧','🧥','🧤','👾','🦾'].map(a=>`<button onclick="saveAvatar('${a}')">${a}</button>`).join('')}</div>`}
function inventory(){document.getElementById('content').innerHTML=head('🎒 Инвентарь');document.getElementById('screen-body').innerHTML=me.inventory.map(x=>`<div class="row item"><span>${esc(x.item)}</span><b>${x.amount}</b></div>`).join('')||'<div class="muted">Пока пусто.</div>'}
function property(){document.getElementById('content').innerHTML=head('🏢 Недвижимость');document.getElementById('screen-body').innerHTML=`<div class="item"><b>🏠 Квартира</b><p class="muted">Личное пространство. Декор и новые комнаты будут открываться по мере развития.</p></div>${me.buildings.map(b=>`<div class="item"><b>${icon(b.kind)} ${label(b.kind)}</b><span class="tag">ур. ${b.level}</span></div>`).join('')}`}
async function arena(){document.getElementById('content').innerHTML=head('⚔️ Арена');document.getElementById('screen-body').innerHTML=`<div class="item"><b>Тренировочный бой</b><p class="muted">Без ставок и потери предметов. За бой: +35 🪙 и +25 XP.</p><button class="action" onclick="pvp(this)">Начать тренировку</button></div>`}
async function clan(){document.getElementById('content').innerHTML=head('👥 Кланы');document.getElementById('screen-body').innerHTML=`<div class="item"><b>${me.clan?`Ты в клане «${esc(me.clan)}»`:'У тебя пока нет клана.'}</b><p class="muted">Кланы помогают объединять игроков и участвовать в общих событиях.</p><button class="action" onclick="createClan(this)">Создать клан</button></div>`}
function collections(){document.getElementById('content').innerHTML=head('🧩 Коллекции');document.getElementById('screen-body').innerHTML=`<div class="collection-grid">${['🏙️ Районы','🚗 Транспорт','👕 Стиль','📡 Артефакты'].map(x=>`<div class="map-tile"><b>${x}</b><small>0 собрано</small></div>`).join('')}</div>`}
function achievements(){document.getElementById('content').innerHTML=head('🏆 Достижения');document.getElementById('screen-body').innerHTML=`<div class="list">${(me.achievements||[]).map(x=>`<div class="item">🏅 ${esc(x)}</div>`).join('')||'<div class="muted">Первые достижения откроются после действий в городе.</div>'}</div>`}
async function newsScreen(){document.getElementById('content').innerHTML=head('📰 Новости');const n=await api('/api/news',{}, {cache:true});document.getElementById('screen-body').innerHTML=n.map(x=>`<div class="item"><b>${esc(x.title)}</b><br><span class="muted">${esc(x.text)}</span></div>`).join('')}
function profile(){document.getElementById('content').innerHTML=head('👤 Профиль');document.getElementById('screen-body').innerHTML=`<div class="item"><div class="big">${esc(me.player.avatar)} ${esc(me.player.name)}</div><p class="muted">Уровень ${me.player.level} · серия ${me.player.streak||0} · ${me.player.coins} 🪙</p></div><button class="action full" onclick="editProfile(this)">Изменить профиль</button>${card('💙 Разработчик',`${esc(me.developer)}<br><span class="muted">Реальные платежи отключены.</span>`)}`}
function help(){document.getElementById('content').innerHTML=head('❓ Помощь');document.getElementById('screen-body').innerHTML=`<div class="item"><b>Как играть?</b><p class="muted">Развивай город, собирай производство, выполняй квесты, открывай районы и собирай коллекции.</p></div><div class="item"><b>Производительность</b><p class="muted">Интерфейс использует минимум запросов и загружает данные только при открытии раздела.</p></div>`}
function settings(){document.getElementById('content').innerHTML=head('⚙️ Настройки');document.getElementById('screen-body').innerHTML=`<div class="item row"><span>Лёгкие анимации</span><button class="tag" onclick="document.body.classList.toggle('lite');toast('Настройка изменена')">Переключить</button></div><div class="item row"><span>Версия</span><span class="muted">1.1 FAST</span></div>`}

async function collect(btn){setBusy(btn);try{const d=await api('/api/collect',{method:'POST'});toast(`+${d.coins} 🪙`);invalidate('/api/me');me=await api('/api/me');renderHeader();city();}catch(e){toast(e.message)}finally{setBusy(btn,false)}}
async function daily(btn){setBusy(btn);try{const d=await api('/api/daily',{method:'POST'});toast(d.ok?`+${d.reward} 🪙 · серия ${d.streak}`:d.message);invalidate('/api/me');me=await api('/api/me');renderHeader();}catch(e){toast(e.message)}finally{setBusy(btn,false)}}
async function upgrade(k,btn){setBusy(btn);try{await api('/api/upgrade/'+k,{method:'POST'});toast('Здание улучшено');invalidate('/api/me');me=await api('/api/me');renderHeader();city();}catch(e){toast(e.message)}finally{setBusy(btn,false)}}
async function pvp(btn){setBusy(btn);try{const d=await api('/api/pvp/training',{method:'POST'});toast(`+${d.reward} 🪙`);invalidate('/api/me');me=await api('/api/me');renderHeader();}catch(e){toast(e.message)}finally{setBusy(btn,false)}}
async function createClan(btn){const n=prompt('Название клана');if(!n)return;setBusy(btn);try{await api('/api/clan/create',{method:'POST',body:JSON.stringify({name:n})});toast('Клан создан');invalidate('/api/me');me=await api('/api/me');renderHeader();clan();}catch(e){toast(e.message)}finally{setBusy(btn,false)}}
async function saveAvatar(a){try{await api('/api/profile',{method:'POST',body:JSON.stringify({avatar:a})});me.player.avatar=a;renderHeader();character();toast('Аватар сохранён')}catch(e){toast(e.message)}}
async function editProfile(btn){const n=prompt('Имя',me.player.name);if(!n)return;const a=prompt('Аватар-эмодзи',me.player.avatar)||me.player.avatar;setBusy(btn);try{await api('/api/profile',{method:'POST',body:JSON.stringify({name:n,avatar:a})});invalidate('/api/me');me=await api('/api/me');renderHeader();profile();toast('Профиль сохранён')}catch(e){toast(e.message)}finally{setBusy(btn,false)}}

load();
