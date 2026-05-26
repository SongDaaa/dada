import sqlite3, json
from config import DB_PATH

def get_db():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA foreign_keys=ON")
    return db

def init_db():
    db = get_db()
    db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            is_admin INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS words (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            word_id TEXT NOT NULL,
            en TEXT NOT NULL,
            zh TEXT NOT NULL,
            phonetic TEXT DEFAULT '',
            status TEXT DEFAULT 'new',
            reviews TEXT DEFAULT '[]',
            next_review INTEGER,
            mistakes INTEGER DEFAULT 0,
            category TEXT DEFAULT '',
            subcat TEXT DEFAULT '',
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(user_id, word_id)
        );
        CREATE TABLE IF NOT EXISTS stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
            data TEXT NOT NULL DEFAULT '{}',
            updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_words_user ON words(user_id);
    """)
    # Migration: add is_admin column if missing
    try:
        db.execute("ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0")
    except:
        pass
    # Migration: add email column if missing
    try:
        db.execute("ALTER TABLE users ADD COLUMN email TEXT DEFAULT ''")
    except:
        pass
    db.commit()
    db.close()

# ── User ──

def create_user(username, password_hash, email=''):
    db = get_db()
    try:
        db.execute("INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)",
                   (username, password_hash, email))
        db.commit()
        return db.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
    except sqlite3.IntegrityError:
        return None
    finally:
        db.close()

def get_user_by_username(username):
    db = get_db()
    row = db.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
    db.close()
    return row

def get_user_by_id(user_id):
    db = get_db()
    row = db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    db.close()
    return row

def get_user_by_email(email):
    db = get_db()
    row = db.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    db.close()
    return row

def update_user_password(user_id, new_password_hash):
    db = get_db()
    db.execute("UPDATE users SET password_hash=? WHERE id=?", (new_password_hash, user_id))
    db.commit()
    db.close()

# ── Words ──

def save_user_words(user_id, words_dict):
    """Merge client words into server DB. Returns merged dict."""
    db = get_db()
    for word_id, w in words_dict.items():
        w = dict(w)
        db.execute("""
            INSERT INTO words (user_id, word_id, en, zh, phonetic, status, reviews, next_review, mistakes, category, subcat, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(user_id, word_id) DO UPDATE SET
                en=excluded.en, zh=excluded.zh, phonetic=excluded.phonetic,
                status=excluded.status, reviews=excluded.reviews,
                next_review=excluded.next_review, mistakes=excluded.mistakes,
                category=excluded.category, subcat=excluded.subcat,
                updated_at=datetime('now')
        """, (user_id, word_id, w.get('en',''), w.get('zh',''), w.get('phonetic',''),
              w.get('status','new'), json.dumps(w.get('reviews',[])),
              w.get('nextReview'), w.get('mistakes',0),
              w.get('category',''), w.get('subcat','')))
    db.commit()
    merged = get_user_words(user_id)
    db.close()
    return merged

def get_user_words(user_id):
    db = get_db()
    rows = db.execute("SELECT * FROM words WHERE user_id=?", (user_id,)).fetchall()
    result = {}
    for r in rows:
        result[r['word_id']] = {
            'en': r['en'], 'zh': r['zh'], 'phonetic': r['phonetic'],
            'status': r['status'], 'reviews': json.loads(r['reviews']),
            'nextReview': r['next_review'], 'mistakes': r['mistakes'],
            'category': r['category'], 'subcat': r['subcat']
        }
    db.close()
    return result

# ── Stats ──

def save_user_stats(user_id, stats_data):
    db = get_db()
    data_json = json.dumps(stats_data, ensure_ascii=False)
    db.execute("""
        INSERT INTO stats (user_id, data, updated_at) VALUES (?, ?, datetime('now'))
        ON CONFLICT(user_id) DO UPDATE SET data=excluded.data, updated_at=datetime('now')
    """, (user_id, data_json))
    db.commit()
    db.close()

def get_user_stats(user_id):
    db = get_db()
    row = db.execute("SELECT * FROM stats WHERE user_id=?", (user_id,)).fetchone()
    db.close()
    if row:
        return json.loads(row['data'])
    return {}

def set_admin(username):
    db = get_db()
    db.execute("UPDATE users SET is_admin=1 WHERE username=?", (username,))
    db.commit()
    db.close()

def is_admin(user_id):
    db = get_db()
    row = db.execute("SELECT is_admin FROM users WHERE id=?", (user_id,)).fetchone()
    db.close()
    return row and row['is_admin'] == 1

def get_all_users_stats():
    db = get_db()
    users = db.execute("SELECT id, username, created_at, is_admin FROM users ORDER BY id").fetchall()
    result = []
    for u in users:
        word_count = db.execute("SELECT COUNT(*) as c FROM words WHERE user_id=?", (u['id'],)).fetchone()['c']
        stat_row = db.execute("SELECT data FROM stats WHERE user_id=?", (u['id'],)).fetchone()
        stats_data = json.loads(stat_row['data']) if stat_row else {}
        result.append({
            'id': u['id'],
            'username': u['username'],
            'created_at': u['created_at'],
            'is_admin': bool(u['is_admin']),
            'word_count': word_count,
            'streak': stats_data.get('streak', 0),
            'checkInStreak': stats_data.get('checkInStreak', 0),
            'totalStudyDays': stats_data.get('totalStudyDays', 0),
            'wordsStudied': stats_data.get('wordsStudied', 0)
        })
    db.close()
    return result
