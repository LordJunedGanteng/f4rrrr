(() => {
  let currentSource = 'youtube';
  let currentMode   = 'bypassed';
  let selectedFile  = null;
  let pollTimer     = null;
  let currentCfg    = { speed: 2.253, amplify: -2 };
  let currentFormat = 'ogg';
  const ROBLOX_SPEED = 0.45;

  // ── Load config on boot ──
  async function loadConfig() {
    const spd = localStorage.getItem('cfg_speed');
    const amp = localStorage.getItem('cfg_amplify');
    if (spd) currentCfg.speed = parseFloat(spd);
    if (amp) currentCfg.amplify = parseInt(amp, 10);
    
    document.getElementById('inp-speed').value   = currentCfg.speed;
    document.getElementById('inp-amplify').value = currentCfg.amplify;
    document.getElementById('val-speed').textContent   = currentCfg.speed;
    document.getElementById('val-amplify').textContent = currentCfg.amplify + ' dB';
    updateHint(currentCfg.speed);
    updateSettingsHint(currentCfg.speed, currentCfg.amplify);
  }
  loadConfig();

  // ── Settings toggle ──
  document.getElementById('settings-toggle').addEventListener('click', () => {
    const body    = document.getElementById('settings-body');
    const chevron = document.getElementById('chevron');
    const open    = body.style.display !== 'none';
    body.style.display    = open ? 'none' : 'block';
    chevron.classList.toggle('open', !open);
  });

  // ── Slider live update ──
  document.getElementById('inp-speed').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    document.getElementById('val-speed').textContent = v.toFixed(3);
    if (!isNaN(v)) updateHint(v);
  });
  document.getElementById('inp-amplify').addEventListener('input', e => {
    const v = parseInt(e.target.value, 10);
    document.getElementById('val-amplify').textContent = v + ' dB';
  });

  function updateHint(speed) {
    const effective = (speed * ROBLOX_SPEED).toFixed(3);
    const el = document.getElementById('roblox-hint-speed');
    if (el) el.textContent = `Roblox 0.45x → tempo efektif ×${effective}`;
  }

  function updateSettingsHint(speed, amplify) {
    const hint = document.getElementById('settings-hint');
    if (hint) hint.textContent = `×${speed}  /  ${amplify >= 0 ? '+' : ''}${amplify} dB`;
  }

  // ── Save settings (with warning modal) ──
  const DEFAULT_SPEED   = 2.253;
  const DEFAULT_AMPLIFY = -2;
  let modalTimer = null;

  async function doSaveSettings() {
    const speed   = parseFloat(document.getElementById('inp-speed').value);
    const amplify = parseInt(document.getElementById('inp-amplify').value, 10);
    const status  = document.getElementById('save-status');
    
    localStorage.setItem('cfg_speed', speed);
    localStorage.setItem('cfg_amplify', amplify);
    currentCfg = { speed, amplify };
    
    updateHint(speed);
    updateSettingsHint(speed, amplify);
    status.textContent = '✓ Tersimpan';
    status.className = 'save-status';
    setTimeout(() => { status.textContent = ''; }, 2500);
  }

  function openSettingsModal() {
    const overlay  = document.getElementById('settings-modal');
    const progress = document.getElementById('modal-progress');
    const countdown= document.getElementById('modal-countdown');
    const continueBtn = document.getElementById('modal-continue');
    overlay.classList.add('open');
    continueBtn.disabled = true;
    progress.style.width = '0%';
    let elapsed = 0;
    const TOTAL = 4000;
    clearInterval(modalTimer);
    modalTimer = setInterval(() => {
      elapsed += 100;
      const pct = Math.min(100, (elapsed / TOTAL) * 100);
      progress.style.width = pct + '%';
      const rem = Math.max(0, Math.ceil((TOTAL - elapsed) / 1000));
      countdown.textContent = rem > 0 ? `Continue (${rem}s)` : 'Continue';
      if (elapsed >= TOTAL) {
        clearInterval(modalTimer);
        continueBtn.disabled = false;
      }
    }, 100);
  }

  function closeSettingsModal() {
    clearInterval(modalTimer);
    document.getElementById('settings-modal').classList.remove('open');
  }

  document.getElementById('btn-save').addEventListener('click', () => openSettingsModal());

  document.getElementById('modal-continue').addEventListener('click', async () => {
    closeSettingsModal();
    await doSaveSettings();
  });

  document.getElementById('modal-skip').addEventListener('click', async () => {
    closeSettingsModal();
    await doSaveSettings();
  });

  document.getElementById('modal-reset').addEventListener('click', async () => {
    closeSettingsModal();
    document.getElementById('inp-speed').value   = DEFAULT_SPEED;
    document.getElementById('inp-amplify').value = DEFAULT_AMPLIFY;
    document.getElementById('val-speed').textContent   = DEFAULT_SPEED;
    document.getElementById('val-amplify').textContent = DEFAULT_AMPLIFY + ' dB';
    updateHint(DEFAULT_SPEED);
    updateSettingsHint(DEFAULT_SPEED, DEFAULT_AMPLIFY);
    await doSaveSettings();
  });

  // close on overlay click
  document.getElementById('settings-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeSettingsModal();
  });

  // ── Cookies ──
  async function loadCookiesStatus() {
    try {
      const res  = await fetch('/api/cookies');
      const data = await res.json();
      setCookiesUI(data.active, data.entries || 0);
    } catch { /* silent */ }
  }
  loadCookiesStatus();

  // ── Cookies drag & drop ──
  const cookiesDropzone  = document.getElementById('cookies-dropzone');
  const cookiesFileInput = document.getElementById('cookies-file-input');

  function loadCookieFile(file) {
    if (!file || !file.name.endsWith('.txt')) return;
    const reader = new FileReader();
    reader.onload = e => {
      document.getElementById('cookies-textarea').value = e.target.result;
      if (cookiesDropzone) cookiesDropzone.querySelector('div').textContent = `✓ ${file.name} dimuat`;
    };
    reader.readAsText(file);
  }

  if (cookiesDropzone && cookiesFileInput) {
    cookiesDropzone.addEventListener('dragover', e => { e.preventDefault(); cookiesDropzone.classList.add('drag-over'); });
    cookiesDropzone.addEventListener('dragleave', () => cookiesDropzone.classList.remove('drag-over'));
    cookiesDropzone.addEventListener('drop', e => {
      e.preventDefault();
      cookiesDropzone.classList.remove('drag-over');
      loadCookieFile(e.dataTransfer.files[0]);
    });
    document.getElementById('cookies-browse').addEventListener('click', () => cookiesFileInput.click());
    cookiesFileInput.addEventListener('change', () => loadCookieFile(cookiesFileInput.files[0]));
  }

  function setCookiesUI(active, entries) {
    const dot   = document.getElementById('cookies-dot');
    const label = document.getElementById('cookies-label');
    const clear = document.getElementById('btn-clear-cookies');
    if (active) {
      dot.className   = 'cookies-dot active';
      label.textContent = `Aktif — ${entries} entri tersimpan`;
      clear.style.display = 'inline-block';
    } else {
      dot.className   = 'cookies-dot';
      label.textContent = 'Belum ada cookies';
      clear.style.display = 'none';
    }
  }

  document.getElementById('btn-save-cookies').addEventListener('click', async () => {
    const content = document.getElementById('cookies-textarea').value.trim();
    const status  = document.getElementById('cookies-save-status');
    if (!content) {
      status.textContent = 'Tempel konten cookies terlebih dahulu.';
      status.className = 'save-status error';
      setTimeout(() => { status.textContent = ''; status.className = 'save-status'; }, 3000);
      return;
    }
    try {
      const res  = await fetch('/api/cookies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cookies: content }) });
      const data = await res.json();
      if (data.ok) {
        setCookiesUI(true, data.entries);
        document.getElementById('cookies-textarea').value = '';
        status.textContent = `Tersimpan — ${data.entries} entri`;
        status.className = 'save-status';
        setTimeout(() => { status.textContent = ''; }, 3000);
      } else {
        status.textContent = data.error || 'Gagal menyimpan.';
        status.className = 'save-status error';
        setTimeout(() => { status.textContent = ''; status.className = 'save-status'; }, 3000);
      }
    } catch {
      status.textContent = 'Koneksi gagal.';
      status.className = 'save-status error';
    }
  });

  document.getElementById('btn-clear-cookies').addEventListener('click', async () => {
    const status = document.getElementById('cookies-save-status');
    try {
      await fetch('/api/cookies', { method: 'DELETE' });
      setCookiesUI(false, 0);
      status.textContent = 'Cookies dihapus.';
      status.className = 'save-status';
      setTimeout(() => { status.textContent = ''; }, 2500);
    } catch {
      status.textContent = 'Koneksi gagal.';
      status.className = 'save-status error';
    }
  });

  // ── URL Preview ──
  let previewTimer = null;

  function fmtDurPreview(s) {
    if (!s) return '';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    return `${m}:${String(sec).padStart(2,'0')}`;
  }

  function clearPreview() {
    const inp = document.getElementById('url-input');
    const box = document.getElementById('url-preview');
    if (inp) inp.classList.remove('has-preview');
    if (box) box.innerHTML = '';
  }

  function showPreviewLoading() {
    document.getElementById('url-preview').innerHTML = `
      <div class="preview-loading">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
        Loading preview...
      </div>`;
    if (!document.getElementById('spin-style')) {
      const s = document.createElement('style');
      s.id = 'spin-style';
      s.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
      document.head.appendChild(s);
    }
  }

  function showPreviewCard(data) {
    const inp = document.getElementById('url-input');
    inp.classList.add('has-preview');

    // Auto-switch to Mixtape if duration > 7 minutes
    const autoMixtape = data.duration && data.duration > 420;
    if (autoMixtape) {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      const mixtapeBtn = document.querySelector('.mode-btn[data-mode="mixtape"]');
      if (mixtapeBtn) mixtapeBtn.classList.add('active');
      currentMode = 'mixtape';
    }

    const thumbHtml = data.thumbnail
      ? `<img class="preview-thumb" src="${esc(data.thumbnail)}" onerror="this.style.display='none'" alt=""/>`
      : `<div class="preview-thumb-placeholder"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>`;
    const dur = fmtDurPreview(data.duration);
    const mixtapeTag = autoMixtape
      ? `<div class="preview-meta-item" style="color:#f472b6;">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
           Auto-switched ke Mixtape
         </div>`
      : '';
    document.getElementById('url-preview').innerHTML = `
      <div class="preview-card">
        ${thumbHtml}
        <div class="preview-info">
          <div class="preview-title">${esc(data.title)}</div>
          <div class="preview-meta">
            ${data.uploader ? `<div class="preview-meta-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              ${esc(data.uploader)}</div>` : ''}
            ${dur ? `<div class="preview-meta-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              ${esc(dur)}</div>` : ''}
            ${mixtapeTag}
          </div>
        </div>
      </div>`;
  }

  function isPlaylistUrl(url) {
    try {
      const u = new URL(url);
      return (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be'))
             && u.searchParams.has('list');
    } catch { return false; }
  }

  function showPreviewError(msg) {
    document.getElementById('url-preview').innerHTML = `
      <div class="preview-loading" style="border-color:rgba(248,113,113,.3);color:#f87171;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        ${esc(msg)}
      </div>`;
  }

  document.getElementById('url-input').addEventListener('input', e => {
    clearTimeout(previewTimer);
    const val = e.target.value.trim();
    if (!val || currentSource === 'upload') { clearPreview(); return; }
    if (!val.startsWith('http://') && !val.startsWith('https://')) { clearPreview(); return; }
    if (isPlaylistUrl(val)) {
      showPreviewError('Link playlist tidak didukung. Paste link video langsung (tanpa &list=...).');
      return;
    }
    showPreviewLoading();
    previewTimer = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/preview?url=${encodeURIComponent(val)}`);
        const data = await res.json();
        if (data.error) { clearPreview(); return; }
        showPreviewCard(data);
      } catch { clearPreview(); }
    }, 700);
  });

  // Clear preview when source changes
  document.querySelectorAll('.source-btn').forEach(btn => {
    btn.addEventListener('click', () => clearPreview());
  });

  // ── Source tabs ──
  document.querySelectorAll('.source-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.source-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSource = btn.dataset.source;

      const urlSec = document.getElementById('url-section');
      const upSec  = document.getElementById('upload-section');
      const inp    = document.getElementById('url-input');

      if (currentSource === 'upload') {
        urlSec.style.display = 'none';
        upSec.style.display  = 'block';
      } else {
        urlSec.style.display = 'block';
        upSec.style.display  = 'none';
        const ph = {
          youtube:    'Paste link YouTube...',
          soundcloud: 'Paste link SoundCloud...',
          spotify:    'Paste link atau judul Spotify...',
        };
        inp.placeholder = ph[currentSource] || 'Paste link...';
      }
    });
  });

  // ── Mode buttons ──
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMode = btn.dataset.mode;
    });
  });

  // ── Preset format buttons ──
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFormat = btn.dataset.format;
    });
  });

  // ── Drop zone ──
  const dropZone  = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');

  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) pickFile(fileInput.files[0]); });
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault(); dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) pickFile(e.dataTransfer.files[0]);
  });

  function pickFile(file) {
    selectedFile = file;
    dropZone.classList.add('file-selected');
    dropZone.querySelector('p').textContent    = file.name;
    dropZone.querySelector('small').textContent = fmtBytes(file.size) + ' — file dipilih';
  }

  // ── Process ──
  document.getElementById('btn-process').addEventListener('click', async () => {
    clearResults();
    clearErrors();

    const formData = new FormData();
    formData.append('source', currentSource);
    formData.append('mode',   currentMode);

    if (currentSource === 'upload') {
      if (!selectedFile) { showError('Pilih atau drop file terlebih dahulu.'); return; }
      formData.append('file', selectedFile);
    } else {
      const url = document.getElementById('url-input').value.trim();
      if (!url) { showError('Masukkan link terlebih dahulu.'); return; }
      if (isPlaylistUrl(url)) { showError('Link playlist tidak didukung. Paste link video langsung.'); return; }
      formData.append('url', url);
    }
    
    formData.append('speed', currentCfg.speed);
    formData.append('amplify', currentCfg.amplify);
    formData.append('reverb', document.getElementById('chk-reverb').checked ? 'true' : 'false');
    formData.append('hz', document.getElementById('sel-hz').value);
    formData.append('format', currentFormat);

    clearPreview();
    setBtn(true);
    showProgress(5, 'Menghubungi server...', '');

    try {
      const res  = await fetch('/api/process', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || data.error) {
        showError(data.error || 'Terjadi kesalahan server.'); hideProgress(); setBtn(false); return;
      }
      setProgress(15, 'Mendownload audio...');
      startPoll(data.job_id);
    } catch {
      showError('Tidak dapat terhubung ke server.'); hideProgress(); setBtn(false);
    }
  });

  // ── Poll ──
  function startPoll(jobId) {
    clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      try {
        const res  = await fetch(`/api/status/${jobId}`);
        const data = await res.json();
        if (data.status === 'processing') {
          setProgress(data.progress || 30, 'Memproses...');
          renderLogs(data.logs || []);
        } else if (data.status === 'done') {
          clearInterval(pollTimer);
          setProgress(100, 'Selesai');
          renderLogs(data.logs || []);
          setTimeout(() => {
            hideProgress();
            window._lastMixtapeParts = data.mixtape_parts || null;
            renderFiles(data.files, data);
            setBtn(false);
            loadHistory();
          }, 700);
        } else if (data.status === 'error') {
          clearInterval(pollTimer);
          renderLogs(data.logs || []);
          showError(data.error || 'Error tidak diketahui.'); hideProgress(); setBtn(false);
        }
      } catch { /* retry */ }
    }, 1000);
  }

  // ── UI helpers ──
  function showProgress(pct, status) {
    document.getElementById('progress-card').style.display = 'block';
    setProgress(pct, status);
  }
  function setProgress(pct, status) {
    document.getElementById('progress-bar').style.width = pct + '%';
    document.getElementById('progress-pct').textContent = pct + '%';
    document.getElementById('progress-status').textContent = status;
  }
  function hideProgress() { document.getElementById('progress-card').style.display = 'none'; }

  // ── Log timeline renderer ──
  function renderLogs(logs) {
    if (!logs || logs.length === 0) return;
    const wrap = document.getElementById('log-wrap');
    const list = document.getElementById('log-list');
    wrap.style.display = 'block';
    list.innerHTML = '';
    logs.forEach(entry => {
      const item = document.createElement('div');
      item.className = 'log-item';

      const dotClass = entry.status || 'pending'; // active | done | error | pending
      item.innerHTML = `
        <div class="log-dot ${dotClass}"></div>
        <div class="log-body">
          <div class="log-label${dotClass === 'done' ? '' : ''}">${esc(entry.label)}</div>
          ${entry.detail ? `<div class="log-detail">${esc(entry.detail)}</div>` : ''}
        </div>
        <div class="log-time">${esc(entry.time || '')}</div>
      `;
      list.appendChild(item);
    });
    // auto-scroll to last item
    list.lastElementChild && list.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function setBtn(loading) {
    const btn = document.getElementById('btn-process');
    btn.disabled    = loading;
    btn.textContent = loading ? 'Processing...' : 'Process Audio';
  }

  function clearResults() {
    document.getElementById('results-card').style.display = 'none';
    document.getElementById('file-list').innerHTML = '';
    const uis = document.getElementById('uploaded-ids-section');
    if(uis) uis.style.display = 'none';
    const uita = document.getElementById('uploaded-ids-textarea');
    if(uita) uita.value = '';
    document.getElementById('log-list').innerHTML = '';
    document.getElementById('log-wrap').style.display = 'none';
    document.getElementById('roblox-card').style.display = 'none';
    document.getElementById('roblox-text').innerHTML = '';
  }
  function clearErrors() {
    document.querySelectorAll('.error-toast').forEach(e => e.remove());
  }

  const btnCopyIds = document.getElementById('btn-copy-ids');
  if (btnCopyIds) {
    btnCopyIds.addEventListener('click', () => {
      const ta = document.getElementById('uploaded-ids-textarea');
      if (!ta.value) return;
      ta.select();
      document.execCommand('copy');
      btnCopyIds.textContent = 'COPIED!';
      setTimeout(() => btnCopyIds.textContent = 'COPY TO CLIPBOARD!', 2000);
    });
  }

  function renderRobloxInfo(mode) {
    if (mode !== 'bypassed' && mode !== 'mixtape') return;
    const speed     = currentCfg.speed;
    const effective = (speed * ROBLOX_SPEED).toFixed(3);
    const diff      = Math.abs(effective - 1.0);
    const tempo     = diff < 0.03
      ? 'hampir sama persis dengan tempo asli'
      : effective > 1.0
        ? `${effective}× lebih cepat dari tempo asli`
        : `${effective}× lebih lambat dari tempo asli`;
    document.getElementById('roblox-text').innerHTML =
      `Dengan <strong>Playback Speed 0.45</strong> di Roblox, audio ini akan terdengar <strong>${tempo}</strong>.<br>` +
      `(Speed bypass <strong>×${speed}</strong> × Roblox <strong>0.45</strong> = <strong>×${effective}</strong>)`;
    document.getElementById('roblox-card').style.display = 'flex';
  }

  let _lastJobData = null;

  function makeFileItemHtml(token, name, size, uid, extraMeta, rbxBtnHtml) {
    return `
      <div class="file-thumb">
        <svg viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
        </svg>
      </div>
      <div class="file-info" style="flex:1;min-width:0;">
        <div class="file-name">${esc(name)}</div>
        <div class="file-size">${fmtBytes(size)}${extraMeta ? ' · ' + extraMeta : ''}</div>
        <div class="rbx-upload-status" id="rbx-status-${uid}"></div>
      </div>
      <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
        <button class="btn-dl" onclick="dlFile('${esc(token)}','${esc(name)}')">Download</button>
        ${rbxBtnHtml}
      </div>
    `;
  }

  function renderFiles(files, jobData = null) {
    _lastJobData = jobData;
    if (!files || !files.length) { showError('Tidak ada file yang dihasilkan.'); return; }
    renderRobloxInfo(currentMode);
    const rc   = document.getElementById('results-card');
    const list = document.getElementById('file-list');
    list.innerHTML = '';
    rc.style.display = 'block';

    const mixtapeParts = window._lastMixtapeParts;
    const isMixtape = mixtapeParts && mixtapeParts.length > 0;

    // Render ZIP / single file row(s)
    files.forEach(f => {
      const div = document.createElement('div');
      div.className = 'file-item';
      const uid = Math.random().toString(36).slice(2);
      const rbxBtn = isMixtape
        ? '' // ZIP row has no Roblox button in mixtape mode
        : `<button class="btn-rbx-upload" id="rbx-btn-${uid}" onclick="openRbxNameModal('${esc(f.token)}','${esc(f.name)}','${uid}',null)">Upload to Roblox</button>`;
      div.innerHTML = makeFileItemHtml(f.token, f.name, f.size, uid, isMixtape ? 'ZIP semua part' : '', rbxBtn);
      list.appendChild(div);
    });

    // Render per-part rows for mixtape
    if (isMixtape) {
      const hdr = document.createElement('div');
      hdr.className = 'mixtape-parts-header';
      hdr.textContent = `${mixtapeParts.length} Part — Upload per Bagian`;
      list.appendChild(hdr);

      mixtapeParts.forEach(part => {
        const uid = Math.random().toString(36).slice(2);
        const div = document.createElement('div');
        div.className = 'file-item';
        const meta = part.is_last ? `Part ${part.index} (END)` : `Part ${part.index}`;
        const rbxBtn = `<button class="btn-rbx-upload" id="rbx-btn-${uid}" onclick="openRbxPartModal('${esc(part.token)}','${esc(part.name)}','${uid}',${part.index},${part.is_last ? 'true' : 'false'})">Upload to Roblox</button>`;
        div.innerHTML = makeFileItemHtml(part.token, part.name, part.size, uid, meta, rbxBtn);
        list.appendChild(div);
      });
    }
  }

  // ── Roblox Notifications ──
  function showRbxApprovalNotif(assetName, assetId) {
    const container = document.getElementById('rbx-notifications');
    const el = document.createElement('div');
    el.className = 'rbx-notif';
    el.innerHTML = `
      <div class="rbx-notif-icon">✓</div>
      <div class="rbx-notif-body">
        <div class="rbx-notif-title">Audio kamu lolos! 🎉</div>
        <div class="rbx-notif-name">${esc(assetName)}</div>
        <div class="rbx-notif-id" style="margin-top:4px; display:flex; align-items:center; justify-content:space-between;">
          ID Assets: ${esc(String(assetId))}
          <a href="https://www.roblox.com/library/${esc(String(assetId))}/" target="_blank" style="text-decoration:none; background:rgba(255,255,255,0.2); color:#fff; padding:2px 6px; border-radius:4px; font-size:10px;">Buka</a>
        </div>
      </div>`;
    container.appendChild(el);
    el.addEventListener('click', () => el.remove());
    setTimeout(() => el.style.transition = 'opacity .5s', 6000);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 500); }, 8000);
  }

  // ── Roblox Upload ──
  let _rbxPending = null;

  window.openRbxNameModal = (token, name, uid, mixtapeParts = null) => {
    _rbxPending = { token, uid, mixtapeParts, partInfo: null };
    const input = document.getElementById('rbx-name-input');
    input.value = name.replace(/\.[^.]+$/, '').replace(/_MIXTAPE$/, '').slice(0, 50);
    document.getElementById('rbx-name-label').textContent = 'Nama Asset';
    document.getElementById('rbx-name-modal').classList.add('open');
    setTimeout(() => { input.focus(); input.select(); }, 100);
  };

  window.openRbxPartModal = (token, name, uid, partIndex, isLast) => {
    _rbxPending = { token, uid, mixtapeParts: null, partInfo: { index: partIndex, isLast } };
    const input = document.getElementById('rbx-name-input');
    // Strip part suffix and extension to get base name
    input.value = name.replace(/\.[^.]+$/, '').replace(/_\d+$/, '').replace(/_END$/, '').slice(0, 44);
    document.getElementById('rbx-name-label').textContent =
      `Nama Base (Part ${partIndex}${isLast ? ' - END' : ''})`;
    document.getElementById('rbx-name-modal').classList.add('open');
    setTimeout(() => { input.focus(); input.select(); }, 100);
  };

  document.getElementById('rbx-name-submit').addEventListener('click', () => {
    const name = document.getElementById('rbx-name-input').value.trim();
    if (!name) { document.getElementById('rbx-name-input').focus(); return; }
    document.getElementById('rbx-name-modal').classList.remove('open');
    if (_rbxPending) {
      const { token, uid, mixtapeParts, partInfo } = _rbxPending;
      _rbxPending = null;
      if (partInfo) {
        const fullName = partInfo.isLast ? `${name}_END` : `${name}_${partInfo.index}`;
        doRbxUpload(token, fullName, uid, 'auto');
      } else if (mixtapeParts && mixtapeParts.length) {
        doRbxMixtapeUpload(name, mixtapeParts, uid);
      } else {
        doRbxUpload(token, name, uid, 'auto');
      }
    }
  });

  document.getElementById('rbx-name-cancel').addEventListener('click', () => {
    document.getElementById('rbx-name-modal').classList.remove('open');
    _rbxPending = null;
  });

  document.getElementById('rbx-name-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('rbx-name-submit').click();
    if (e.key === 'Escape') document.getElementById('rbx-name-cancel').click();
  });

  document.getElementById('rbx-name-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) document.getElementById('rbx-name-cancel').click();
  });

  // Single file upload
  window.doRbxUpload = async (token, name, uid, target = 'auto') => {
    const statusEl = document.getElementById(`rbx-status-${uid}`);
    const btnEl    = document.getElementById(`rbx-btn-${uid}`);
    if (statusEl) { statusEl.className = 'rbx-upload-status uploading'; statusEl.style.display = 'block'; statusEl.innerHTML = '⏳ Mengupload ke Roblox...'; }
    if (btnEl) btnEl.disabled = true;
    const hist = rbxHistAdd({ asset_name: name, status: 'uploading', target });
    renderRbxHistory();
    try {
      const res  = await fetch('/api/roblox/upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name: name.replace(/\.[^.]+$/, ''), target,
          api_key: localStorage.getItem('rbx_api_key') || '',
          user_id: localStorage.getItem('rbx_user_id') || '',
          group_api_key: localStorage.getItem('rbx_group_api_key') || '',
          group_id: localStorage.getItem('rbx_group_id') || '',
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        if (statusEl) { statusEl.className = 'rbx-upload-status error'; statusEl.textContent = `✗ ${data.error}`; }
        if (btnEl) btnEl.disabled = false;
        rbxHistPatch(hist.id, { status: 'error' });
        return;
      }
      if (statusEl) { statusEl.className = 'rbx-upload-status pending'; statusEl.textContent = '🔄 Menunggu moderasi Roblox... (cek tiap 15 detik)'; }
      rbxHistPatch(hist.id, { status: 'pending', operation_id: data.operation_id });
      pollRbxOperation(data.operation_id, target, uid, name, false, hist.id);
    } catch {
      if (statusEl) { statusEl.className = 'rbx-upload-status error'; statusEl.textContent = '✗ Koneksi gagal.'; }
      if (btnEl) btnEl.disabled = false;
      rbxHistPatch(hist.id, { status: 'error' });
    }
  };

  // Mixtape multi-part upload
  async function doRbxMixtapeUpload(baseName, parts, uid) {
    const statusEl = document.getElementById(`rbx-status-${uid}`);
    const btnEl    = document.getElementById(`rbx-btn-${uid}`);
    if (btnEl) btnEl.disabled = true;
    const total = parts.length;
    const opIds = [];

    for (let i = 0; i < parts.length; i++) {
      const part     = parts[i];
      const isLast   = part.is_last || (i === parts.length - 1);
      const partName = isLast ? `${baseName}_END` : `${baseName}_${i + 1}`;
      if (statusEl) { statusEl.className = 'rbx-upload-status uploading'; statusEl.style.display = 'block'; statusEl.innerHTML = `⏳ Upload part ${i + 1}/${total} (${esc(partName)})...`; }
      const hist = rbxHistAdd({ asset_name: partName, status: 'uploading', target: 'auto' });
      renderRbxHistory();
      try {
        const res  = await fetch('/api/roblox/upload', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: part.token, name: partName, target: 'auto',
            api_key: localStorage.getItem('rbx_api_key') || '',
            user_id: localStorage.getItem('rbx_user_id') || '',
            group_api_key: localStorage.getItem('rbx_group_api_key') || '',
            group_id: localStorage.getItem('rbx_group_id') || '',
          }),
        });
        const data = await res.json();
        if (!data.ok) {
          if (statusEl) { statusEl.className = 'rbx-upload-status error'; statusEl.textContent = `✗ Part ${i + 1} gagal: ${data.error}`; }
          if (btnEl) btnEl.disabled = false;
          rbxHistPatch(hist.id, { status: 'error' });
          return;
        }
        rbxHistPatch(hist.id, { status: 'pending', operation_id: data.operation_id });
        opIds.push({ opId: data.operation_id, name: partName, histId: hist.id });
      } catch {
        if (statusEl) { statusEl.className = 'rbx-upload-status error'; statusEl.textContent = `✗ Koneksi gagal saat upload part ${i + 1}.`; }
        if (btnEl) btnEl.disabled = false;
        rbxHistPatch(hist.id, { status: 'error' });
        return;
      }
    }

    if (statusEl) { statusEl.className = 'rbx-upload-status pending'; statusEl.innerHTML = `🔄 Semua ${total} part terupload — menunggu moderasi Roblox...`; }
    if (btnEl) btnEl.disabled = false;

    // Poll each part every 15 seconds
    opIds.forEach(({ opId, name, histId }) => pollRbxOperation(opId, 'auto', uid, name, true, histId));
  }

  // Thumbnail panel renderer
  function renderThumbPanel(uid, assetId, assetName, status, imageUrl) {
    const statusEl = document.getElementById(`rbx-status-${uid}`);
    if (!statusEl) return;
    const panelId  = `rbx-thumb-${uid}-${assetId}`;
    let panel = document.getElementById(panelId);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = panelId;
      panel.className = 'rbx-thumb-panel';
      statusEl.parentNode.insertBefore(panel, statusEl.nextSibling);
    }
    const badgeLabel = status === 'accepted' ? 'Accepted' : status === 'rejected' ? 'Rejected' : 'Pending';
    const dotAnim    = status === 'pending' ? ' pending' : '';
    panel.innerHTML = `
      ${imageUrl ? `<img class="rbx-thumb-img" src="${esc(imageUrl)}" alt="thumbnail"/>` : ''}
      <div class="rbx-thumb-info">
        <div class="rbx-thumb-badge ${status}">
          <span class="rbx-thumb-dot${dotAnim}"></span>${badgeLabel}
        </div>
        <div class="rbx-thumb-name">${esc(assetName)}</div>
        <div class="rbx-thumb-id" style="display:flex; gap:8px; align-items:center; margin-top:4px;">
          ID: ${esc(String(assetId))}
          <a href="https://www.roblox.com/library/${esc(String(assetId))}/" target="_blank" style="text-decoration:none; background:#3b82f6; color:#fff; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:500;">Buka Link</a>
        </div>
      </div>`;
  }

  // Poll thumbnail every 15s until accepted/rejected
  function pollRbxThumbnail(assetId, assetName, uid, isMixtapePart = false, histId = null) {
    const check = async () => {
      try {
        const res  = await fetch(`/api/roblox/thumbnail/${assetId}`);
        const data = await res.json();
        if (data.error) { setTimeout(check, 15000); return; }
        renderThumbPanel(uid, assetId, assetName, data.status, data.image_url);
        if (data.status === 'accepted') {
          rbxHistPatch(histId, { status: 'accepted', asset_id: String(assetId) });
          showRbxApprovalNotif(assetName, assetId);
          
          const uis = document.getElementById('uploaded-ids-section');
          const uita = document.getElementById('uploaded-ids-textarea');
          if (uis && uita) {
            uis.style.display = 'block';
            if (uita.value === '') {
              const baseName = assetName.replace(/_[0-9]+$/, '').replace(/_END$/, '');
              uita.value = baseName + '\\n' + String(assetId) + '\\n';
            } else {
              uita.value += String(assetId) + '\\n';
            }
          }

          if (!isMixtapePart) {
            const statusEl = document.getElementById(`rbx-status-${uid}`);
            if (statusEl) {
              statusEl.className = 'rbx-upload-status done';
              statusEl.innerHTML = `✓ Diterima! Asset ID: <strong style="color:#fff;user-select:all;">${assetId}</strong> <a href="https://www.roblox.com/library/${assetId}/" target="_blank" style="text-decoration:none; background:#3b82f6; color:#fff; padding:2px 8px; border-radius:4px; font-size:11px; margin-left:6px;">Buka Link</a>`;
            }
          }
        } else if (data.status === 'rejected') {
          rbxHistPatch(histId, { status: 'rejected', asset_id: String(assetId) });
          if (!isMixtapePart) {
            const statusEl = document.getElementById(`rbx-status-${uid}`);
            if (statusEl) { statusEl.className = 'rbx-upload-status error'; statusEl.textContent = '✗ Ditolak oleh moderasi Roblox.'; }
          }
        } else {
          setTimeout(check, 15000);
        }
      } catch { setTimeout(check, 15000); }
    };
    setTimeout(check, 3000);
  }

  // Polling — wait for operation to get asset_id, then switch to thumbnail polling
  function pollRbxOperation(opId, target, uid, assetName = '', isMixtapePart = false, histId = null) {
    const statusEl = document.getElementById(`rbx-status-${uid}`);
    const btnEl    = document.getElementById(`rbx-btn-${uid}`);

    const check = async () => {
      try {
        const paramStr = new URLSearchParams({
          target: target,
          api_key: localStorage.getItem('rbx_api_key') || '',
          group_api_key: localStorage.getItem('rbx_group_api_key') || ''
        }).toString();
        const res  = await fetch(`/api/roblox/operation/${opId}?${paramStr}`);
        const data = await res.json();
        if (data.error) {
          if (!isMixtapePart) {
            if (statusEl) { statusEl.className = 'rbx-upload-status error'; statusEl.textContent = `✗ ${data.error}`; }
            if (btnEl) btnEl.disabled = false;
          }
          rbxHistPatch(histId, { status: 'error' });
          return;
        }
        if (data.done) {
          if (data.rejected) {
            if (!isMixtapePart) {
              if (statusEl) { statusEl.className = 'rbx-upload-status error'; statusEl.textContent = '✗ Ditolak oleh moderasi Roblox.'; }
              if (btnEl) btnEl.disabled = false;
            }
            rbxHistPatch(histId, { status: 'rejected' });
          } else if (data.asset_id) {
            rbxHistPatch(histId, { status: 'pending', asset_id: String(data.asset_id) });
            if (!isMixtapePart) {
              if (statusEl) { statusEl.className = 'rbx-upload-status pending'; statusEl.innerHTML = `🔄 Upload diterima — cek moderasi... (tiap 15 detik)`; }
              if (btnEl) btnEl.disabled = false;
            } else {
              if (statusEl) statusEl.innerHTML = statusEl.innerHTML + `<br>🔄 ${esc(assetName)}: menunggu moderasi...`;
            }
            pollRbxThumbnail(data.asset_id, assetName, uid, isMixtapePart, histId);
          } else {
            setTimeout(check, 15000);
          }
        } else {
          setTimeout(check, 15000);
        }
      } catch { setTimeout(check, 15000); }
    };
    setTimeout(check, 5000);
  }

  function showError(msg) {
    const wrap = document.querySelector('.main-wrap');
    const div  = document.createElement('div');
    div.className = 'error-toast';
    div.innerHTML = `
      <svg viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      ${esc(msg)}
    `;
    wrap.insertBefore(div, wrap.querySelector('#btn-process').nextSibling);
    setTimeout(() => div.remove(), 7000);
  }

  // ── Utils ──
  function fmtBytes(b) {
    if (!b) return '';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
    return (b/1048576).toFixed(2) + ' MB';
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // ── Roblox Config Load/Save ──
  async function loadRobloxConfig() {
    const user_id = localStorage.getItem('rbx_user_id');
    const api_key = localStorage.getItem('rbx_api_key');
    const group_id = localStorage.getItem('rbx_group_id');
    const group_api_key = localStorage.getItem('rbx_group_api_key');
    
    if (user_id) document.getElementById('rbx-user-id').value = user_id;
    if (api_key) document.getElementById('rbx-api-key').placeholder = '(tersimpan di browser)';
    if (group_id) document.getElementById('rbx-group-id').value = group_id;
    if (group_api_key) document.getElementById('rbx-group-api-key').placeholder = '(tersimpan di browser)';
    
    const oauthInfo = document.getElementById('rbx-oauth-connected');
    if (oauthInfo) oauthInfo.style.display = 'none';
  }
  loadRobloxConfig();

  // Roblox tabs
  document.querySelectorAll('.rbx-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.rbx-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.rbx-tab-content').forEach(c => c.style.display = 'none');
      const tab = document.getElementById('rtab-' + btn.dataset.rbxtab);
      if (tab) tab.style.display = 'block';
    });
  });

  document.getElementById('btn-save-rbx-personal').addEventListener('click', () => {
    const uid = document.getElementById('rbx-user-id').value.trim();
    const key = document.getElementById('rbx-api-key').value.trim();
    if(uid) localStorage.setItem('rbx_user_id', uid);
    if(key) localStorage.setItem('rbx_api_key', key);
    
    const st = document.getElementById('rbx-personal-status');
    st.textContent = 'Tersimpan';
    setTimeout(() => { st.textContent = ''; }, 2000);
    loadRobloxConfig();
  });

  document.getElementById('btn-save-rbx-group').addEventListener('click', () => {
    const gid = document.getElementById('rbx-group-id').value.trim();
    const gkey= document.getElementById('rbx-group-api-key').value.trim();
    if(gid)  localStorage.setItem('rbx_group_id', gid);
    if(gkey) localStorage.setItem('rbx_group_api_key', gkey);
    
    const st = document.getElementById('rbx-group-status');
    st.textContent = 'Tersimpan';
    setTimeout(() => { st.textContent = ''; }, 2000);
    loadRobloxConfig();
  });

  document.getElementById('btn-rbx-connect').addEventListener('click', async () => {
    const st = document.getElementById('rbx-oauth-status');
    // Save credentials first
    await saveRbxSection('oauth', {
      client_id:     document.getElementById('rbx-client-id').value.trim(),
      client_secret: document.getElementById('rbx-client-secret').value.trim(),
    }, 'rbx-oauth-status');
    // Open OAuth popup
    const popup = window.open('/api/roblox/auth', 'roblox_auth', 'width=520,height=680');
    if (!popup) { st.textContent = 'Popup diblokir browser!'; st.className = 'save-status error'; return; }
    window.addEventListener('message', async (e) => {
      if (e.data === 'roblox_auth_done') {
        await loadRobloxConfig();
        st.textContent = 'Berhasil terhubung!'; st.className = 'save-status';
        setTimeout(() => { st.textContent = ''; st.className = 'save-status'; }, 3000);
      }
    }, { once: true });
  });

  document.getElementById('btn-rbx-disconnect').addEventListener('click', async () => {
    await fetch('/api/roblox/disconnect', { method: 'POST' });
    document.getElementById('rbx-oauth-connected').style.display = 'none';
  });

  window.dlFile = (token, name) => {
    const a = document.createElement('a');
    a.href = `/api/download/${token}`;
    a.download = name;
    a.click();
  };

  // ── History ──
  const SOURCE_ICON = { youtube:'YT', soundcloud:'SC', spotify:'SP', upload:'UP' };
  const MODE_LABEL  = { normal:'Normal', bypassed:'Bypassed', mixtape:'Mixtape' };

  function fmtDur(s) {
    if (!s) return '';
    return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
  }

  function fmtTs(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('id-ID',{day:'2-digit',month:'short'}) + ' ' +
             d.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
    } catch { return ''; }
  }

  // ── Roblox Upload History (localStorage) ──
  const RBX_HIST_KEY = 'rbx_upload_history';

  function rbxHistLoad() {
    try { return JSON.parse(localStorage.getItem(RBX_HIST_KEY) || '[]'); } catch { return []; }
  }
  function rbxHistSave(list) {
    try { localStorage.setItem(RBX_HIST_KEY, JSON.stringify(list.slice(0, 50))); } catch {}
  }
  function rbxHistAdd(entry) {
    const list = rbxHistLoad();
    const id   = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const item = { id, ts: Date.now(), ...entry };
    list.unshift(item);
    rbxHistSave(list);
    return item;
  }
  function rbxHistPatch(id, patch) {
    if (!id) return;
    const list = rbxHistLoad();
    const idx  = list.findIndex(e => e.id === id);
    if (idx < 0) return;
    Object.assign(list[idx], patch);
    rbxHistSave(list);
    const div = document.getElementById(`rbx-h-${id}`);
    if (div) div.innerHTML = rbxHistItemHtml(list[idx]);
  }

  function rbxHistItemHtml(e) {
    const labels = { uploading:'Uploading', pending:'Pending', accepted:'Accepted', rejected:'Rejected', error:'Error' };
    const idStr  = e.asset_id ? `<div class="rbx-hist-id">ID: ${esc(String(e.asset_id))}</div>` : '';
    return `
      <span class="rbx-hist-badge ${esc(e.status)}">${labels[e.status] || e.status}</span>
      <div style="flex:1;min-width:0;">
        <div class="rbx-hist-name">${esc(e.asset_name)}</div>
        ${idStr}
      </div>
      <div style="font-size:11px;color:var(--muted);flex-shrink:0;">${esc(fmtTs(e.ts))}</div>`;
  }

  function renderRbxHistory() {
    const list = rbxHistLoad();
    const card = document.getElementById('rbx-history-card');
    const ul   = document.getElementById('rbx-history-list');
    if (!list.length) { card.style.display = 'none'; return; }
    card.style.display = 'block';
    ul.innerHTML = '';
    list.forEach(e => {
      const div = document.createElement('div');
      div.className = 'rbx-hist-item';
      div.id = `rbx-h-${e.id}`;
      div.innerHTML = rbxHistItemHtml(e);
      ul.appendChild(div);
    });
  }

  function resumeRbxPolls() {
    rbxHistLoad()
      .filter(e => e.status === 'pending' && e.asset_id)
      .forEach(e => pollRbxThumbnail(e.asset_id, e.asset_name, null, false, e.id));
  }

  async function loadHistory() {
    try {
      const res  = await fetch('/api/history');
      const data = await res.json();
      const card = document.getElementById('history-card');
      const list = document.getElementById('history-list');
      if (!data.length) { card.style.display = 'none'; return; }
      card.style.display = 'block';
      list.innerHTML = '';
      data.forEach(h => {
        const div = document.createElement('div');
        div.className = 'history-item';
        const mode    = h.source === 'upload' ? 'upload' : (h.mode || 'bypassed');
        const badge   = MODE_LABEL[h.mode] || h.mode || 'Unknown';
        const src     = SOURCE_ICON[h.source] || h.source?.toUpperCase()?.slice(0,2) || '?';
        const dur     = fmtDur(h.duration);
        const size    = h.size ? (h.size/1024/1024).toFixed(2) + ' MB' : '';
        const meta    = [src, dur, size, `${h.files||1} file`].filter(Boolean).join(' · ');
        div.innerHTML = `
          <span class="history-badge ${mode}">${esc(badge)}</span>
          <div class="history-info">
            <div class="history-title" title="${esc(h.title)}">${esc(h.title)}</div>
            <div class="history-meta">${esc(meta)}</div>
          </div>
          <div class="history-time">${esc(fmtTs(h.ts))}</div>
        `;
        list.appendChild(div);
      });
    } catch { /* silent */ }
  }
  loadHistory();

  renderRbxHistory();
  resumeRbxPolls();

  document.getElementById('btn-clear-history').addEventListener('click', async () => {
    await fetch('/api/history', { method: 'DELETE' });
    document.getElementById('history-card').style.display = 'none';
  });

  document.getElementById('btn-clear-rbx-history').addEventListener('click', () => {
    localStorage.removeItem(RBX_HIST_KEY);
    document.getElementById('rbx-history-card').style.display = 'none';
  });

})();
