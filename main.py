import yt_dlp
from pydub import AudioSegment
import os
import json
from flask import Flask, render_template, jsonify, request, send_file, redirect, session, url_for
import requests as _req
import urllib.parse
import datetime
import string
import random
import shutil
import zipfile
import uuid
import threading
import secrets
import psutil
import time
import functools
from werkzeug.security import generate_password_hash, check_password_hash
try:
    import audioop
except ImportError:
    try:
        import audioop_lts as audioop
    except ImportError:
        # Some systems might not have it yet
        audioop = None

def get_random_string(length=8):
    letters = string.ascii_lowercase + string.digits
    return ''.join(random.choice(letters) for i in range(length))

os.makedirs("downloads", exist_ok=True)

# ─────────────────────────────────────────────
#  WEB SERVICE (Flask)
# ─────────────────────────────────────────────
app = Flask(__name__, template_folder='templates', static_folder='static')
app.secret_key = os.environ.get("FLASK_SECRET", secrets.token_hex(24))

# Data storage (JSON-based for Render compatibility)
USERS_FILE  = 'users.json'
HISTORY_FILE = 'history.json'
ADMIN_CREDENTIALS = {
    "username": "rkdkcw",
    "password": generate_password_hash("admin@123")
}

# Helper to load/save JSON data
def load_json(path, default=[]):
    if os.path.exists(path):
        try:
            with open(path, 'r') as f: return json.load(f)
        except: return default
    return default

def save_json(path, data):
    with open(path, 'w') as f: json.dump(data, f, indent=2)

# Auth middleware
def login_required(f):
    @functools.wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login_page'))
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    @functools.wraps(f)
    def decorated_function(*args, **kwargs):
        if 'is_admin' not in session:
            return redirect(url_for('admin_login_page'))
        return f(*args, **kwargs)
    return decorated_function

# Job storage: job_id -> {status, progress, step, files, error}
web_jobs = {}
# Token -> file path (for secure download)
download_tokens = {}
# Online tracking
active_sessions = {} # session_id -> last_seen

def track_activity():
    if 'act_id' not in session: session['act_id'] = str(uuid.uuid4())
    active_sessions[session['act_id']] = time.time()

@app.route('/api/online_count')
def api_online_count():
    now = time.time()
    # Prune sessions older than 5 mins
    to_del = [sid for sid, ts in active_sessions.items() if now - ts > 300]
    for sid in to_del: active_sessions.pop(sid, None)
    return jsonify({'count': len(active_sessions)})

COOKIES_FILE = 'DISCORD AUDIOBYPASSBOT/cookies.txt'

def cookies_active():
    return os.path.exists(COOKIES_FILE) and os.path.getsize(COOKIES_FILE) > 10

def _get_ffmpeg_location():
    try:
        base = os.path.dirname(os.path.abspath(__file__))
    except NameError:
        import sys
        base = os.path.dirname(os.path.abspath(sys.argv[0]))
    # 1. Cek folder ffmpeg/ di sebelah main.py langsung
    local_exe = os.path.join(base, 'ffmpeg', 'ffmpeg.exe')
    if os.path.isfile(local_exe):
        return os.path.join(base, 'ffmpeg')
    # 2. Baca dari ffmpeg_path.txt
    txt = os.path.join(base, 'ffmpeg_path.txt')
    if os.path.isfile(txt):
        with open(txt, 'r') as f:
            exe = f.read().strip()
        if exe and os.path.isfile(exe):
            return os.path.dirname(exe)
    # 3. Fallback dari env var
    exe = os.environ.get('FFMPEG_PATH_ENV', '').strip()
    if exe and os.path.isfile(exe):
        return os.path.dirname(exe)
    return None

def _apply_cookies(opts):
    if cookies_active():
        opts['cookiefile'] = COOKIES_FILE
    loc = _get_ffmpeg_location()
    if loc:
        opts['ffmpeg_location'] = loc
    return opts

def get_ydl_opts(out_template):
    opts = {
        'format': 'bestaudio/best',
        'postprocessors': [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3', 'preferredquality': '192'}],
        'outtmpl': out_template,
        'quiet': True,
        'nocheckcertificate': True,
        'no_warnings': True,
        'default_search': 'auto',
        'source_address': '0.0.0.0',
        'retries': 3,
        'fragment_retries': 3,
        'socket_timeout': 30,
        'no_color': True,
    }
    loc = _get_ffmpeg_location()
    if loc:
        opts['ffmpeg_location'] = loc
    return _apply_cookies(opts)

def _ts():
    return datetime.datetime.now().strftime('%H:%M:%S')

def process_web_job(job_id, source, mode, url_or_path, is_upload, speed=2.253, amplify=-2):
    job = web_jobs[job_id]

    def log(label, status='active', detail=''):
        job['logs'].append({'label': label, 'status': status, 'detail': detail, 'time': _ts()})

    def done_last(detail=''):
        if job['logs']:
            job['logs'][-1]['status'] = 'done'
            if detail: job['logs'][-1]['detail'] = detail

    def err_last(detail=''):
        if job['logs']:
            job['logs'][-1]['status'] = 'error'
            if detail: job['logs'][-1]['detail'] = detail

    try:
        job['status']   = 'processing'
        job['progress'] = 5
        job['logs']     = []

        mp3_file  = None
        tmp_files = []
        title     = ''
        duration  = 0

        if is_upload:
            title = os.path.splitext(os.path.basename(url_or_path))[0]
            log('File diterima dari upload', detail=os.path.basename(url_or_path))
            done_last()
            mp3_file = url_or_path
            job['progress'] = 30
        else:
            src_names = {'youtube': 'YouTube', 'soundcloud': 'SoundCloud', 'spotify': 'Spotify'}
            src_label = src_names.get(source, source)
            log(f'Menghubungi {src_label}...')
            job['progress'] = 10

            random_prefix = get_random_string()
            out_tpl  = f'downloads/web_{random_prefix}.%(ext)s'
            ydl_opts = get_ydl_opts(out_tpl)
            q = f'ytsearch1:{url_or_path}' if source == 'spotify' else url_or_path

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(q, download=True)
                if 'entries' in info:
                    info = info['entries'][0]
                mp3_file = ydl.prepare_filename(info).rsplit('.', 1)[0] + '.mp3'
                tmp_files.append(mp3_file)

            title    = info.get('title', 'unknown')
            duration = info.get('duration', 0)
            dur_str  = f"{int(duration//60)}:{int(duration%60):02d}" if duration else '?'
            done_last(detail=f'{title} — {dur_str}')
            job['progress'] = 30

            log('Konversi ke MP3...')
            job['progress'] = 38
            done_last(detail='192kbps')

        job['progress'] = 40

        if mode == 'normal':
            log('Menyiapkan file output...')
            token    = get_random_string(16)
            out_name = f"{get_random_string()}.mp3"
            out_path = f"downloads/{out_name}"
            shutil.copy(mp3_file, out_path)
            download_tokens[token] = out_path
            size = os.path.getsize(out_path)
            done_last(detail=f'{size/1024/1024:.2f} MB')
            job['files']    = [{'name': out_name, 'size': size, 'token': token}]
            job['progress'] = 100

        elif mode == 'bypassed':
            log('Memuat audio ke memori...')
            job['progress'] = 45
            audio = AudioSegment.from_file(mp3_file)
            dur_s = len(audio) / 1000
            done_last(detail=f'{int(dur_s//60)}:{int(dur_s%60):02d} durasi asli')

            log(f'Speed up audio (x{speed})...')
            job['progress'] = 60
            audio = audio._spawn(audio.raw_data, overrides={
                'frame_rate': int(audio.frame_rate * speed)
            }).set_frame_rate(44100)
            new_dur = len(audio) / 1000
            done_last(detail=f'Durasi baru: {int(new_dur//60)}:{int(new_dur%60):02d}')

            log(f'Amplify volume ({amplify:+d} dB)...')
            job['progress'] = 72
            audio = audio + amplify
            done_last()

            log('Export ke OGG (Q10)...')
            job['progress'] = 82
            token    = get_random_string(16)
            out_name = f"{get_random_string()}_BP.ogg"
            out_path = f"downloads/{out_name}"
            audio.export(out_path, format='ogg', parameters=['-q:a', '10'])
            size = os.path.getsize(out_path)
            if size > 8 * 1024 * 1024:
                log('File > 8MB, re-encode ke Q8...')
                audio.export(out_path, format='ogg', parameters=['-q:a', '8'])
                size = os.path.getsize(out_path)
                done_last(detail=f'{size/1024/1024:.2f} MB (dikompresi)')
            else:
                done_last(detail=f'{size/1024/1024:.2f} MB')
            download_tokens[token] = out_path
            job['files']    = [{'name': out_name, 'size': size, 'token': token}]
            job['progress'] = 100

        elif mode == 'mixtape':
            log('Memuat audio ke memori...')
            job['progress'] = 42
            audio_original = AudioSegment.from_file(mp3_file)
            total_dur = len(audio_original) / 1000
            done_last(detail=f'Total: {int(total_dur//60)}:{int(total_dur%60):02d}')

            # --- Split logic: max 15:30 per segment ---
            SEG_MS      = 930_000  # 15 min 30 sec
            total_ms    = len(audio_original)
            n_full      = total_ms // SEG_MS
            remainder   = total_ms % SEG_MS
            raw_segments = [audio_original[i * SEG_MS:(i + 1) * SEG_MS] for i in range(n_full)]
            if remainder > 0:
                raw_segments.append(audio_original[n_full * SEG_MS:])
            total_segs  = len(raw_segments)

            # Determine base title
            if is_upload:
                base_title = os.path.basename(url_or_path).rsplit('.', 1)[0][:40]
            else:
                base_title = (title or 'MIXTAPE')[:40]
            safe_title = "".join(c for c in base_title if c.isalnum() or c in " _-").strip().replace(" ", "_") or "MIXTAPE"

            log(f'Membagi menjadi {total_segs} track (max 15:30/track)...')
            job['progress'] = 48
            done_last(detail=f'{total_segs} track terdeteksi')

            # Bypass each segment, collect temp ogg paths
            ogg_paths = []
            ogg_names = []
            for idx, segment in enumerate(raw_segments, 1):
                pct       = 48 + int((idx / total_segs) * 44)
                is_last   = (idx == total_segs)
                track_tag = f'_TRACK{idx}_END' if is_last else f'_TRACK{idx}'
                ogg_name  = f'{safe_title}{track_tag}.ogg'
                out_path  = f'downloads/{get_random_string()}_{ogg_name}'

                log(f'Bypass track {idx}/{total_segs}...')
                job['progress'] = pct

                processed = segment._spawn(segment.raw_data, overrides={
                    'frame_rate': int(segment.frame_rate * speed)
                }).set_frame_rate(44100)
                processed = processed + amplify

                processed.export(out_path, format='ogg', parameters=['-q:a', '10'])
                if os.path.getsize(out_path) > 8 * 1024 * 1024:
                    processed.export(out_path, format='ogg', parameters=['-q:a', '8'])

                seg_dur = len(processed) / 1000
                done_last(detail=f'{int(seg_dur//60)}:{int(seg_dur%60):02d} — {os.path.getsize(out_path)/1024/1024:.2f} MB')
                ogg_paths.append(out_path)
                ogg_names.append(ogg_name)

            # Pack all OGGs into one ZIP
            log('Membuat ZIP...')
            job['progress'] = 95
            zip_name = f'{safe_title}_MIXTAPE.zip'
            zip_path = f'downloads/{get_random_string()}_{zip_name}'
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                for ogg_path, ogg_name in zip(ogg_paths, ogg_names):
                    zf.write(ogg_path, ogg_name)

            # Keep individual OGGs alive for Roblox per-part upload
            mixtape_parts = []
            for idx, (ogg_path, ogg_name) in enumerate(zip(ogg_paths, ogg_names), 1):
                is_last  = (idx == total_segs)
                part_tok = get_random_string(16)
                download_tokens[part_tok] = ogg_path
                mixtape_parts.append({
                    'token':   part_tok,
                    'name':    ogg_name,
                    'index':   idx,
                    'is_last': is_last,
                    'size':    os.path.getsize(ogg_path),
                })

            zip_size  = os.path.getsize(zip_path)
            token     = get_random_string(16)
            download_tokens[token] = zip_path
            done_last(detail=f'{total_segs} track — {zip_size/1024/1024:.2f} MB')
            job['files']         = [{'name': zip_name, 'size': zip_size, 'token': token}]
            job['mixtape_parts'] = mixtape_parts
            job['progress'] = 100

        # cleanup
        for f in tmp_files:
            if f and os.path.exists(f) and f != url_or_path:
                try: os.remove(f)
                except: pass
        if is_upload and mp3_file and os.path.exists(mp3_file):
            try:
                os.remove(mp3_file)
            except:
                pass

        log('Selesai — file siap diunduh', status='done')
        job['status'] = 'done'
        total_size = sum(f.get('size', 0) for f in job.get('files', []))
        save_history_entry({
            'title':    title or url_or_path,
            'source':   source,
            'mode':     mode,
            'speed':    speed,
            'amplify':  amplify,
            'url':      '' if is_upload else url_or_path,
            'duration': duration,
            'size':     total_size,
            'files':    len(job.get('files', [])),
            'ts':       datetime.datetime.now().isoformat(),
        })

    except Exception as e:
        err_last(detail=str(e))
        job['status'] = 'error'
        job['error']  = str(e)
        print(f'    [!] Web Job Error ({job_id}): {e}')


# ─────────────────────────────────────────────
#  CORE ROUTES (Landing & Auth)
# ─────────────────────────────────────────────
@app.route('/')
def landing_page():
    track_activity()
    if 'user_id' in session: return redirect(url_for('app_dashboard'))
    return render_template('landing.html')

@app.route('/login', methods=['GET', 'POST'])
def login_page():
    track_activity()
    if request.method == 'POST':
        user_list = load_json(USERS_FILE, {})
        user     = request.form.get('username', '').strip()
        pw       = request.form.get('password', '').strip()
        if user in user_list and check_password_hash(user_list[user]['password'], pw):
            session['user_id'] = user
            return redirect(url_for('app_dashboard'))
        return render_template('auth.html', error="Username atau password salah")
    return render_template('auth.html', mode='login')

@app.route('/signup', methods=['GET', 'POST'])
def signup_page():
    if request.method == 'POST':
        user_list = load_json(USERS_FILE, {})
        user     = request.form.get('username', '').strip()
        pw       = request.form.get('password', '').strip()
        if not user or not pw: return render_template('auth.html', error="Harap isi semua field", mode='signup')
        if user in user_list: return render_template('auth.html', error="Username sudah terpakai", mode='signup')
        user_list[user] = {
            'password':   generate_password_hash(pw),
            'is_premium': False,
            'joined_at':  datetime.datetime.now().isoformat()
        }
        save_json(USERS_FILE, user_list)
        session['user_id'] = user
        return redirect(url_for('app_dashboard'))
    return render_template('auth.html', mode='signup')

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('landing_page'))

@app.route('/app')
@login_required
def app_dashboard():
    track_activity()
    users = load_json(USERS_FILE, {})
    user_info = users.get(session['user_id'], {})
    return render_template('index.html', 
                           user=session['user_id'], 
                           is_premium=user_info.get('is_premium', False))

# ─────────────────────────────────────────────
#  ADMIN PANEL
# ─────────────────────────────────────────────
@app.route('/admin/login', methods=['GET', 'POST'])
def admin_login_page():
    if request.method == 'POST':
        user = request.form.get('username', '').strip()
        pw   = request.form.get('password', '').strip()
        if user == ADMIN_CREDENTIALS['username'] and check_password_hash(ADMIN_CREDENTIALS['password'], pw):
            session['is_admin'] = True
            return redirect(url_for('admin_dashboard'))
        return render_template('auth.html', error="Invalid Admin Credentials", mode='admin')
    return render_template('auth.html', mode='admin')

@app.route('/admin/dashboard')
@admin_required
def admin_dashboard():
    track_activity()
    return render_template('admin.html')

@app.route('/api/admin/stats')
@admin_required
def api_admin_stats():
    users   = load_json(USERS_FILE, {})
    history = load_json(HISTORY_FILE, [])
    # System Stats
    mem = psutil.virtual_memory()
    # Health Checks
    def check_status(url):
        try: return 200 <= _req.head(url, timeout=3).status_code < 400
        except: return False
    
    return jsonify({
        'total_users': len(users),
        'premium_users': sum(1 for u in users.values() if u.get('is_premium')),
        'total_tasks': len(history),
        'memory': {
            'total': mem.total,
            'used': mem.used,
            'percent': mem.percent
        },
        'apis': {
            'youtube': check_status('https://www.youtube.com'),
            'spotify': check_status('https://www.spotify.com'),
            'roblox':  check_status('https://apis.roblox.com/assets/v1/assets'),
        }
    })

@app.route('/api/admin/users')
@admin_required
def api_admin_users():
    return jsonify(load_json(USERS_FILE, {}))

@app.route('/api/admin/toggle_premium', methods=['POST'])
@admin_required
def api_admin_toggle_premium():
    target = request.json.get('username')
    users  = load_json(USERS_FILE, {})
    if target in users:
        users[target]['is_premium'] = not users[target].get('is_premium', False)
        save_json(USERS_FILE, users)
        return jsonify({'ok': True, 'new_status': users[target]['is_premium']})
    return jsonify({'error': 'User not found'}), 404

@app.route('/api/admin/analytics')
@admin_required
def api_admin_analytics():
    history = load_json(HISTORY_FILE, [])
    
    # Group by settings to find success rate
    # Schema assumed: entry has 'status' (from Roblox check) or we infer from history
    # Since history entries at line 351 don't have 'status' yet, 
    # we assume 'status' is added when roblox operation completes.
    
    stats = {} # (speed, amplify) -> {success: 0, total: 0}
    for entry in history:
        s = entry.get('speed', 2.253)
        a = entry.get('amplify', -2)
        key = f"{s}|{a}"
        if key not in stats: stats[key] = {'accepted': 0, 'total': 0}
        stats[key]['total'] += 1
        # Mark as accepted if it has 'done' status or an asset_id
        if entry.get('roblox_status') == 'accepted' or entry.get('asset_id'):
            stats[key]['accepted'] += 1
    
    # Find best setting
    best_key = None
    best_rate = -1
    for key, val in stats.items():
        rate = val['accepted'] / val['total'] if val['total'] > 0 else 0
        if rate > best_rate:
            best_rate = rate
            best_key = key
    
    # Default if no history
    recommendation = {"speed": 2.253, "amplify": -2, "confidence": 0}
    if best_key:
        s_str, a_str = best_key.split('|')
        recommendation = {
            "speed": float(s_str),
            "amplify": int(a_str),
            "confidence": int(best_rate * 100)
        }

    return jsonify({
        'recommendation': recommendation,
        'total_history': len(history),
        'success_trend': stats # for advanced charts
    })

# ─────────────────────────────────────────────
#  COOKIES API
# ─────────────────────────────────────────────
@app.route('/api/cookies', methods=['GET', 'POST', 'DELETE'])
@login_required
def api_cookies():
    if request.method == 'GET':
        active = cookies_active()
        entries = 0
        if active:
            with open(COOKIES_FILE, 'r') as f: entries = sum(1 for line in f if line.strip() and not line.startswith('#'))
        return jsonify({'active': active, 'entries': entries})
    
    if request.method == 'POST':
        c_text = request.json.get('cookies', '').strip()
        if not c_text: return jsonify({'error': 'Empty content'}), 400
        os.makedirs(os.path.dirname(COOKIES_FILE), exist_ok=True)
        with open(COOKIES_FILE, 'w') as f: f.write(c_text)
        entries = sum(1 for line in c_text.splitlines() if line.strip() and not line.startswith('#'))
        return jsonify({'ok': True, 'entries': entries})
    
    if request.method == 'DELETE':
        if os.path.exists(COOKIES_FILE): os.remove(COOKIES_FILE)
        return jsonify({'ok': True})

@app.route('/favicon.ico')
def favicon():
    return '', 204

@app.route('/api/process', methods=['POST'])
@login_required
def api_process():
    source = request.form.get('source', 'youtube')
    mode   = request.form.get('mode', 'bypassed')
    url    = request.form.get('url', '').strip()
    f      = request.files.get('file')

    is_upload = False
    path_or_url = url

    if source == 'upload':
        if not f:
            return jsonify({'error': 'Tidak ada file yang diupload.'}), 400
        ext = f.filename.rsplit('.', 1)[-1].lower() if '.' in f.filename else 'mp3'
        if ext not in ['mp3', 'wav', 'ogg', 'm4a', 'flac']:
            return jsonify({'error': 'Format file tidak didukung.'}), 400
        tmp_name   = f"downloads/web_upload_{get_random_string()}.{ext}"
        os.makedirs('downloads', exist_ok=True)
        f.save(tmp_name)
        path_or_url = tmp_name
        is_upload   = True
    else:
        if not url:
            return jsonify({'error': 'URL tidak boleh kosong.'}), 400
        # Blacklist playlist URLs
        if source == 'youtube':
            from urllib.parse import urlparse, parse_qs
            parsed = urlparse(url)
            qs = parse_qs(parsed.query)
            if 'list' in qs:
                return jsonify({'error': 'Link playlist tidak didukung. Paste link video langsung (tanpa &list=...).'}), 400

    job_id = str(uuid.uuid4())
    web_jobs[job_id] = {'status': 'processing', 'progress': 5, 'step': 'Antri...', 'files': [], 'error': None, 'logs': []}

    try:
        speed_val = float(request.form.get('speed', 2.253))
    except:
        speed_val = 2.253

    try:
        amplify_val = int(request.form.get('amplify', -2))
    except:
        amplify_val = -2

    t = threading.Thread(target=process_web_job, args=(job_id, source, mode, path_or_url, is_upload, speed_val, amplify_val), daemon=True)
    t.start()

    return jsonify({'job_id': job_id})

@app.route('/api/status/<job_id>')
@login_required
def api_status(job_id):
    job = web_jobs.get(job_id)
    if not job:
        return jsonify({'error': 'Job tidak ditemukan.'}), 404
    return jsonify(job)

@app.route('/api/download/<token>')
@login_required
def api_download(token):
    path = download_tokens.get(token)
    if not path or not os.path.exists(path):
        return jsonify({'error': 'File tidak ditemukan atau sudah kedaluwarsa.'}), 404
    return send_file(path, as_attachment=True)

@app.route('/health')
def health():
    return jsonify({'status': 'ok', 'bot': 'running'})

# ─────────────────────────────────────────────
#  ROBLOX INTEGRATION
# ─────────────────────────────────────────────
HISTORY_FILE        = 'history.json'
ROBLOX_CONFIG_FILE  = 'roblox_config.json'
ROBLOX_ASSET_URL    = 'https://apis.roblox.com/assets/v1/assets'
ROBLOX_OP_URL       = 'https://apis.roblox.com/assets/v1/operations'
ROBLOX_AUTH_URL     = 'https://apis.roblox.com/oauth/v1/authorize'
ROBLOX_TOKEN_URL    = 'https://apis.roblox.com/oauth/v1/token'
ROBLOX_USERINFO_URL = 'https://apis.roblox.com/oauth/v1/userinfo'

def save_history_entry(entry):
    history = []
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, 'r') as f:
                history = json.load(f)
        except:
            history = []
    history.insert(0, entry)
    history = history[:100]  # keep last 100
    with open(HISTORY_FILE, 'w') as f:
        json.dump(history, f)

@app.route('/api/preview')
@login_required
def api_preview():
    url = request.args.get('url', '').strip()
    if not url:
        return jsonify({'error': 'URL kosong'}), 400
    ydl_opts = {
        'quiet': True, 'no_warnings': True, 'skip_download': True,
        'nocheckcertificate': True, 'noplaylist': True,
    }
    loc = _get_ffmpeg_location()
    if loc:
        ydl_opts['ffmpeg_location'] = loc
    _apply_cookies(ydl_opts)
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            if info and 'entries' in info:
                info = info['entries'][0]
        return jsonify({
            'title':     info.get('title', ''),
            'uploader':  info.get('uploader') or info.get('channel') or info.get('artist') or '',
            'duration':  info.get('duration', 0),
            'thumbnail': info.get('thumbnail', ''),
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/history', methods=['GET'])
@login_required
def api_history_get():
    if not os.path.exists(HISTORY_FILE):
        return jsonify([])
    try:
        with open(HISTORY_FILE, 'r') as f:
            return jsonify(json.load(f))
    except:
        return jsonify([])

@app.route('/api/history', methods=['DELETE'])
@login_required
def api_history_delete():
    if os.path.exists(HISTORY_FILE):
        os.remove(HISTORY_FILE)
    return jsonify({'ok': True})

@app.route('/api/roblox/thumbnail/<asset_id>')
@login_required
def api_roblox_thumbnail(asset_id):
    try:
        resp = _req.get(
            'https://thumbnails.roblox.com/v1/assets',
            params={
                'assetIds':     asset_id,
                'returnPolicy': 'PlaceHolder',
                'size':         '150x150',
                'format':       'Png',
                'isCircular':   'false',
            },
            timeout=10,
        )
        data_list = resp.json().get('data', [])
        item      = data_list[0] if data_list else {}
        image_url = item.get('imageUrl', '')
        state     = item.get('state', '')
        if state == 'Completed' or 't2.rbxcdn.com' in image_url:
            status = 'accepted'
        elif state in ('Blocked', 'Moderated') or 't6.rbxcdn.com' in image_url:
            status = 'rejected'
        else:
            status = 'pending'
        return jsonify({'status': status, 'image_url': image_url, 'state': state})
    except Exception as e:
        return jsonify({'error': str(e)}), 502

@app.route('/api/roblox/upload', methods=['POST'])
@login_required
def api_roblox_upload():
    data      = request.get_json(force=True) or {}
    token     = data.get('token', '')
    name      = (data.get('name', 'AudioBypassBot') or 'AudioBypassBot')[:50]
    target    = data.get('target', 'personal')
    file_path = download_tokens.get(token)
    if not file_path or not os.path.exists(file_path):
        return jsonify({'error': 'File tidak ditemukan atau sudah kadaluarsa.'}), 404
    if target == 'group':
        api_key  = data.get('group_api_key', '').strip()
        group_id = data.get('group_id', '').strip()
        if not api_key or not group_id:
            return jsonify({'error': 'Group API Key dan Group ID harus diisi.'}), 400
        headers = {'x-api-key': api_key}
        creator = {'groupId': group_id}
    else:
        api_key = data.get('api_key', '').strip()
        user_id = data.get('user_id', '').strip()
        if not api_key or not user_id:
            return jsonify({'error': 'API Key dan User ID harus diisi.'}), 400
        headers = {'x-api-key': api_key}
        creator = {'userId': user_id}
    ext      = file_path.rsplit('.', 1)[-1].lower()
    mime     = {'ogg': 'audio/ogg', 'mp3': 'audio/mpeg', 'wav': 'audio/wav'}.get(ext, 'audio/mpeg')
    asset_req = json.dumps({
        'assetType':       'Audio',
        'displayName':     name,
        'description':     '',
        'creationContext': {'creator': creator},
    })
    try:
        with open(file_path, 'rb') as f:
            resp = _req.post(
                ROBLOX_ASSET_URL,
                headers=headers,
                data={'request': asset_req},
                files={'fileContent': (os.path.basename(file_path), f, mime)},
                timeout=60,
            )
    except Exception as e:
        return jsonify({'error': f'Koneksi ke Roblox gagal: {e}'}), 502
    if resp.status_code not in (200, 202):
        try:    err_msg = resp.json().get('message', resp.text)
        except: err_msg = resp.text
        return jsonify({'error': f'Roblox API: {err_msg}'}), 502
    result = resp.json()
    path   = result.get('path', '')
    op_id  = result.get('operationId') or (path.split('/')[-1] if path else '')
    return jsonify({'ok': True, 'operation_id': op_id, 'path': path})

@app.route('/api/roblox/operation/<op_id>')
@login_required
def api_roblox_operation(op_id):
    target = request.args.get('target', 'personal')
    if target == 'group':
        headers = {'x-api-key': request.args.get('group_api_key', '')}
    else:
        headers = {'x-api-key': request.args.get('api_key', '')}
    try:
        resp = _req.get(f'{ROBLOX_OP_URL}/{op_id}', headers=headers, timeout=15)
    except Exception as e:
        return jsonify({'error': str(e)}), 502
    if resp.status_code != 200:
        return jsonify({'error': f'HTTP {resp.status_code}'}), 502
    result   = resp.json()
    done     = result.get('done', False)
    asset_id = None
    rejected = False
    if done:
        response_data = result.get('response', {})
        asset_id      = response_data.get('assetId')
        if not asset_id and result.get('error'):
            rejected = True
    return jsonify({'done': done, 'asset_id': asset_id, 'rejected': rejected})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, threaded=True)
