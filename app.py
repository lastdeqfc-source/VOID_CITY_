import os, json, hmac, hashlib, sqlite3, time
from urllib.parse import parse_qsl
from datetime import datetime, timezone
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

load_dotenv()
BOT_TOKEN=os.getenv("BOT_TOKEN","")
DB_PATH=os.getenv("DATABASE_URL","sqlite:///void_city.db").replace("sqlite:///","")
DEVELOPER=os.getenv("DEVELOPER","@hiddenvoicer")

app=FastAPI(title="VOID CITY Ultra")
app.mount("/web", StaticFiles(directory="web"), name="web")

def db():
    c=sqlite3.connect(DB_PATH, timeout=10)
    c.row_factory=sqlite3.Row
    c.execute('PRAGMA journal_mode=WAL')
    c.execute('PRAGMA synchronous=NORMAL')
    c.execute('PRAGMA busy_timeout=5000')
    return c

def init():
    c=db()
    c.executescript("""
    CREATE TABLE IF NOT EXISTS players(
      id INTEGER PRIMARY KEY AUTOINCREMENT, tg_id INTEGER UNIQUE, username TEXT,
      name TEXT, avatar TEXT DEFAULT '🌑', coins INTEGER DEFAULT 500,
      energy INTEGER DEFAULT 100, xp INTEGER DEFAULT 0, level INTEGER DEFAULT 1,
      streak INTEGER DEFAULT 0, last_daily TEXT, district TEXT DEFAULT 'Центр',
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS buildings(
      player_id INTEGER, kind TEXT, level INTEGER DEFAULT 1, stored INTEGER DEFAULT 0,
      PRIMARY KEY(player_id,kind)
    );
    CREATE TABLE IF NOT EXISTS inventory(
      player_id INTEGER, item TEXT, amount INTEGER DEFAULT 0,
      PRIMARY KEY(player_id,item)
    );
    CREATE TABLE IF NOT EXISTS achievements(
      player_id INTEGER, key TEXT, unlocked_at TEXT,
      PRIMARY KEY(player_id,key)
    );
    CREATE TABLE IF NOT EXISTS quests(
      player_id INTEGER, key TEXT, progress INTEGER DEFAULT 0,
      claimed INTEGER DEFAULT 0, PRIMARY KEY(player_id,key)
    );
    CREATE TABLE IF NOT EXISTS clans(
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, owner_id INTEGER, created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS clan_members(
      clan_id INTEGER, player_id INTEGER, PRIMARY KEY(clan_id,player_id)
    );
    CREATE INDEX IF NOT EXISTS idx_players_level ON players(level DESC, xp DESC);
    CREATE INDEX IF NOT EXISTS idx_buildings_player ON buildings(player_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_player ON inventory(player_id);
    CREATE INDEX IF NOT EXISTS idx_quests_player ON quests(player_id);
    """)
    c.commit(); c.close()
init()

def valid_init_data(raw):
    if not raw or not BOT_TOKEN: return None
    try:
        pairs=dict(parse_qsl(raw,keep_blank_values=True))
        received=pairs.pop("hash",None)
        if not received: return None
        check="\n".join(f"{k}={pairs[k]}" for k in sorted(pairs))
        secret=hmac.new(b"WebAppData",BOT_TOKEN.encode(),hashlib.sha256).digest()
        calc=hmac.new(secret,check.encode(),hashlib.sha256).hexdigest()
        if not hmac.compare_digest(calc,received): return None
        user=json.loads(pairs.get("user","{}"))
        return user
    except Exception:
        return None

def get_player(request: Request):
    raw=request.headers.get("X-Telegram-Init-Data","")
    user=valid_init_data(raw)
    if user:
        return user
    # Demo mode is intentionally limited to local testing.
    if os.getenv("DEMO_MODE","")=="1":
        return {"id":999999,"first_name":"Demo","username":"demo"}
    raise HTTPException(401,"Telegram session is not valid")

def ensure_player(u):
    c=db(); p=c.execute("SELECT * FROM players WHERE tg_id=?",(u["id"],)).fetchone()
    if not p:
        name=(u.get("first_name") or "Игрок")[:32]
        c.execute("INSERT INTO players(tg_id,username,name,created_at) VALUES(?,?,?,?,?)",
                  (u["id"],u.get("username",""),name,datetime.now(timezone.utc).isoformat()))
        pid=c.execute("SELECT id FROM players WHERE tg_id=?",(u["id"],)).fetchone()["id"]
        for k in ("factory","lab","market"):
            c.execute("INSERT INTO buildings(player_id,kind) VALUES(?,?)",(pid,k))
        for item in ("metal","energy","data","chips"):
            c.execute("INSERT INTO inventory(player_id,item,amount) VALUES(?,?,0)",(pid,item))
        p=c.execute("SELECT * FROM players WHERE id=?",(pid,)).fetchone()
        c.commit()
    c.close(); return p

def xp_for(level): return 100 + (level-1)*75

def add_xp(c,pid,n):
    p=c.execute("SELECT * FROM players WHERE id=?",(pid,)).fetchone()
    xp=p["xp"]+n; lvl=p["level"]
    while xp>=xp_for(lvl):
        xp-=xp_for(lvl); lvl+=1
    c.execute("UPDATE players SET xp=?,level=? WHERE id=?",(xp,lvl,pid))

@app.get("/")
def home(): return FileResponse("web/index.html", headers={"Cache-Control":"no-cache"})

@app.get("/api/me")
def me(request:Request):
    u=get_player(request); p=ensure_player(u); c=db()
    b=c.execute("SELECT kind,level,stored FROM buildings WHERE player_id=?",(p["id"],)).fetchall()
    inv=c.execute("SELECT item,amount FROM inventory WHERE player_id=?",(p["id"],)).fetchall()
    ach=c.execute("SELECT key FROM achievements WHERE player_id=?",(p["id"],)).fetchall()
    q=c.execute("SELECT key,progress,claimed FROM quests WHERE player_id=?",(p["id"],)).fetchall()
    clan=c.execute("""SELECT cl.name FROM clans cl JOIN clan_members cm ON cm.clan_id=cl.id WHERE cm.player_id=?""",(p["id"],)).fetchone()
    c.close()
    return {"player":dict(p),"buildings":[dict(x) for x in b],"inventory":[dict(x) for x in inv],
            "achievements":[x["key"] for x in ach],"quests":[dict(x) for x in q],
            "clan":clan["name"] if clan else None,"developer":DEVELOPER}

@app.post("/api/profile")
async def profile(request:Request):
    u=get_player(request); p=ensure_player(u); data=await request.json()
    name=str(data.get("name",p["name"]))[:32].strip() or p["name"]
    avatar=str(data.get("avatar",p["avatar"]))[:8]
    c=db(); c.execute("UPDATE players SET name=?,avatar=? WHERE id=?",(name,avatar,p["id"])); c.commit(); c.close()
    return {"ok":True}

@app.post("/api/daily")
def daily(request:Request):
    u=get_player(request); p=ensure_player(u); today=datetime.now(timezone.utc).date().isoformat()
    if p["last_daily"]==today: return {"ok":False,"message":"Награда уже получена"}
    c=db(); streak=(p["streak"] or 0)+1
    reward=100+min(streak,7)*50
    c.execute("UPDATE players SET coins=coins+?,streak=?,last_daily=? WHERE id=?",(reward,streak,today,p["id"]))
    add_xp(c,p["id"],30); c.commit(); c.close()
    return {"ok":True,"reward":reward,"streak":streak}

@app.post("/api/collect")
def collect(request:Request):
    u=get_player(request); p=ensure_player(u); c=db()
    rows=c.execute("SELECT kind,level,stored FROM buildings WHERE player_id=?",(p["id"],)).fetchall()
    total=0
    for r in rows:
        amount=r["stored"]+r["level"]*8
        total+=amount
        c.execute("UPDATE buildings SET stored=0 WHERE player_id=? AND kind=?",(p["id"],r["kind"]))
    c.execute("UPDATE players SET coins=coins+? WHERE id=?",(total,p["id"]))
    add_xp(c,p["id"],total//5); c.commit(); c.close()
    return {"ok":True,"coins":total}

@app.post("/api/upgrade/{kind}")
def upgrade(kind:str,request:Request):
    if kind not in ("factory","lab","market"): raise HTTPException(400,"Unknown building")
    u=get_player(request); p=ensure_player(u); c=db()
    b=c.execute("SELECT * FROM buildings WHERE player_id=? AND kind=?",(p["id"],kind)).fetchone()
    cost=150*b["level"]
    if p["coins"]<cost: raise HTTPException(400,"Недостаточно монет")
    c.execute("UPDATE players SET coins=coins-? WHERE id=?",(cost,p["id"]))
    c.execute("UPDATE buildings SET level=level+1 WHERE player_id=? AND kind=?",(p["id"],kind))
    add_xp(c,p["id"],50); c.commit(); c.close()
    return {"ok":True,"cost":cost}

@app.get("/api/leaderboard")
def leaderboard(request:Request):
    get_player(request); c=db()
    rows=c.execute("SELECT name,avatar,level,xp,coins,district FROM players ORDER BY level DESC,xp DESC LIMIT 20").fetchall()
    c.close(); return [dict(x) for x in rows]

@app.get("/api/quests")
def quests(request:Request):
    u=get_player(request); p=ensure_player(u); c=db()
    defs=[("login","Забрать ежедневную награду",1,80),("collector","Собрать производство",1,120),("builder","Улучшить здание",1,150)]
    for key,_,target,_ in defs:
        c.execute("INSERT OR IGNORE INTO quests(player_id,key,progress) VALUES(?,?,0)",(p["id"],key))
    c.commit()
    rows=c.execute("SELECT key,progress,claimed FROM quests WHERE player_id=?",(p["id"],)).fetchall()
    c.close()
    return [{"key":r["key"],"progress":r["progress"],"claimed":r["claimed"],
             "title":next(x[1] for x in defs if x[0]==r["key"]),
             "target":next(x[2] for x in defs if x[0]==r["key"]),
             "reward":next(x[3] for x in defs if x[0]==r["key"])} for r in rows]

@app.post("/api/quest/{key}/claim")
def claim_quest(key:str,request:Request):
    u=get_player(request); p=ensure_player(u); c=db()
    defs={"login":(1,80),"collector":(1,120),"builder":(1,150)}
    if key not in defs: raise HTTPException(404,"Quest not found")
    target,reward=defs[key]
    q=c.execute("SELECT * FROM quests WHERE player_id=? AND key=?",(p["id"],key)).fetchone()
    if not q or q["progress"]<target or q["claimed"]: raise HTTPException(400,"Квест ещё не выполнен")
    c.execute("UPDATE quests SET claimed=1 WHERE player_id=? AND key=?",(p["id"],key))
    c.execute("UPDATE players SET coins=coins+? WHERE id=?",(reward,p["id"])); add_xp(c,p["id"],40)
    c.commit(); c.close(); return {"ok":True,"reward":reward}

@app.post("/api/clan/create")
async def clan_create(request:Request):
    u=get_player(request); p=ensure_player(u); data=await request.json()
    name=str(data.get("name","")).strip()[:24]
    if len(name)<3: raise HTTPException(400,"Название слишком короткое")
    c=db()
    try:
        cur=c.execute("INSERT INTO clans(name,owner_id,created_at) VALUES(?,?,?)",(name,p["id"],datetime.now(timezone.utc).isoformat()))
        cid=cur.lastrowid; c.execute("INSERT INTO clan_members VALUES(?,?)",(cid,p["id"])); c.commit()
    except sqlite3.IntegrityError: raise HTTPException(400,"Такой клан уже существует")
    finally: c.close()
    return {"ok":True,"name":name}

@app.post("/api/clan/join")
async def clan_join(request:Request):
    u=get_player(request); p=ensure_player(u); data=await request.json(); name=str(data.get("name","")).strip()
    c=db(); cl=c.execute("SELECT * FROM clans WHERE name=?",(name,)).fetchone()
    if not cl: c.close(); raise HTTPException(404,"Клан не найден")
    try:
        c.execute("INSERT INTO clan_members VALUES(?,?)",(cl["id"],p["id"])); c.commit()
    except sqlite3.IntegrityError: pass
    c.close(); return {"ok":True}

@app.get("/api/news")
def news(request:Request):
    get_player(request)
    return [
      {"title":"Новый район открыт","text":"Центральный сектор расширен. Стройте и развивайте город."},
      {"title":"Ночь синтетиков","text":"Сегодня действует бонус XP за сбор производства."},
      {"title":"Городская хроника","text":"Лучшие игроки недели появятся на доске рейтинга."}
    ]

@app.get("/api/meta")
def meta(request:Request):
    get_player(request)
    return {"developer":DEVELOPER,"version":"1.0 ULTRA","features":[
      "Профиль","Город","Производство","Квесты","Достижения","Кланы",
      "Рейтинг","Районы","Инвентарь","Ежедневные награды","Безопасный PvP"
    ]}

@app.post("/api/pvp/training")
def pvp(request:Request):
    u=get_player(request); p=ensure_player(u); c=db()
    # Non-wager training battle: deterministic server-side reward, no money stakes.
    reward=35
    c.execute("UPDATE players SET coins=coins+?,energy=MAX(0,energy-10) WHERE id=?",(reward,p["id"]))
    add_xp(c,p["id"],25); c.commit(); c.close()
    return {"ok":True,"reward":reward,"message":"Тренировочный бой завершён"}

@app.get("/api/support")
def support(request:Request):
    get_player(request)
    return {"developer":DEVELOPER,"message":"Спасибо за поддержку проекта! Раздел оплаты пока отключён."}
