const tg=window.Telegram?.WebApp; tg?.ready(); tg?.expand();
const H={'Content-Type':'application/json','X-Telegram-Init-Data':tg?.initData||''};
let me=null;
async function api(path,opt={}){let r=await fetch(path,{...opt,headers:{...H,...(opt.headers||{})}});let d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.detail||d.message||'Ошибка');return d}
function toast(s){let x=document.getElementById('toast');x.textContent=s;x.style.display='block';setTimeout(()=>x.style.display='none',1800)}
async function load(){me=await api('/api/me');renderHeader();city()}
function renderHeader(){let p=me.player;document.getElementById('name').textContent=p.name;document.getElementById('avatar').textContent=p.avatar;document.getElementById('lvl').textContent=`Уровень ${p.level} · ${p.coins} 🪙 · ⚡ ${p.energy}`;document.getElementById('xpbar').style.width=Math.min(100,p.xp/(100+(p.level-1)*75)*100)+'%'}
function card(title,body){return `<div class="card"><div class="title">${title}</div>${body}</div>`}
function city(){document.getElementById('content').innerHTML=card('🌆 Твой город',`<div class="grid">
${me.buildings.map(b=>`<div class="item"><b>${icon(b.kind)} ${label(b.kind)}</b><div class="muted">Ур. ${b.level}</div><br><button class="action" onclick="upgrade('${b.kind}')">Улучшить · ${150*b.level} 🪙</button></div>`).join('')}</div>
<br><button class="action" onclick="collect()">⚡ Собрать производство</button>
<button class="ghost" onclick="daily()">🎁 Ежедневная награда</button>`)+card('📰 Городская хроника','<div id="news">Загрузка...</div>')+card('🧭 Район',`<span class="tag">${me.player.district}</span> <span class="muted">Скоро откроются новые сектора.</span>`);news()}
function icon(k){return {factory:'🏭',lab:'🧪',market:'🏪'}[k]||'🏢'} function label(k){return {factory:'Фабрика',lab:'Лаборатория',market:'Рынок'}[k]||k}
async function news(){let n=await api('/api/news');document.getElementById('news').innerHTML=n.map(x=>`<div class="item"><b>${x.title}</b><br><span class="muted">${x.text}</span></div>`).join('')}
async function collect(){let d=await api('/api/collect',{method:'POST'});toast(`+${d.coins} 🪙`);await load()}
async function daily(){let d=await api('/api/daily',{method:'POST'});toast(d.ok?`+${d.reward} 🪙 · серия ${d.streak}`:d.message);await load()}
async function upgrade(k){try{let d=await api('/api/upgrade/'+k,{method:'POST'});toast(`Здание улучшено`);await load()}catch(e){toast(e.message)}}
async function quests(){let q=await api('/api/quests');document.getElementById('content').innerHTML=card('🎯 Квесты',`<div class="list">${q.map(x=>`<div class="item"><b>${x.title}</b><div class="muted">${x.progress}/${x.target} · награда ${x.reward} 🪙</div>${x.claimed?'✅ Получено':x.progress>=x.target?`<button class="action" onclick="claim('${x.key}')">Забрать</button>`:'Выполняй задания, чтобы открыть награду'}</div>`).join('')}</div>`)+card('🏅 Достижения','Твои достижения будут открываться по мере развития города.')}
async function claim(k){try{let d=await api('/api/quest/'+k+'/claim',{method:'POST'});toast(`+${d.reward} 🪙`);await load();quests()}catch(e){toast(e.message)}}
async function rating(){let r=await api('/api/leaderboard');document.getElementById('content').innerHTML=card('🏆 Рейтинг',`<div class="list">${r.map((x,i)=>`<div class="item row"><span>${i+1}. ${x.avatar} <b>${x.name}</b></span><span>ур. ${x.level}</span></div>`).join('')}</div>`)}
async function clan(){document.getElementById('content').innerHTML=card('🛡️ Кланы',`<div class="muted">${me.clan?`Ты в клане <b>${me.clan}</b>`:'У тебя пока нет клана.'}</div><br><button class="action" onclick="createClan()">Создать клан</button>`)}
async function createClan(){let n=prompt('Название клана');if(!n)return;try{await api('/api/clan/create',{method:'POST',body:JSON.stringify({name:n})});toast('Клан создан');await load()}catch(e){toast(e.message)}}
function profile(){document.getElementById('content').innerHTML=card('👤 Профиль',`<div class="item"><b>${me.player.name}</b><br><span class="muted">Telegram ID скрыт · разработчик: ${me.developer}</span></div><br><button class="action" onclick="editProfile()">Изменить профиль</button><br><br>${card('💙 Поддержка разработчика',`Проект развивается благодаря игрокам. ${me.developer}<br><span class="muted">Реальные платежи отключены в этой сборке.</span>`)}`)}
async function editProfile(){let n=prompt('Имя',me.player.name);if(!n)return;let a=prompt('Аватар-эмодзи',me.player.avatar)||me.player.avatar;try{await api('/api/profile',{method:'POST',body:JSON.stringify({name:n,avatar:a})});toast('Профиль сохранён');await load();profile()}catch(e){toast(e.message)}}
function market(){document.getElementById('content').innerHTML=card('📦 Рынок','Обмен ресурсов и расширенный рынок будут активированы в следующем серверном модуле.')+card('🎒 Инвентарь',me.inventory.map(x=>`<div class="row item"><span>${x.item}</span><b>${x.amount}</b></div>`).join(''))}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>({city,market,quests,clan,rating,profile}[b.dataset.tab])());
load().catch(e=>{document.getElementById('content').innerHTML=card('Ошибка',e.message+'<br>Открой игру через Telegram Mini App.');});
