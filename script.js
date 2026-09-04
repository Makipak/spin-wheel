(() => {
  'use strict';

  // ---------- state ----------
  const STORAGE_KEY = 'spinwheel:v1';
  const PALETTE = [
    '#ee2f2f','#eb6d1e','#fecc0a','#8bc53f','#38a5e0',
    '#3e4db6','#8c3fae','#e0439f','#00b3a4','#f2545b'
  ];

  // ---------- rigging config (HANYA lewat source code, tidak ada UI untuk ini) ----------
  // Isi dengan nama-nama "kandidat favorit". Tiap kali spin, pemenang DIPAKSA jadi salah satu
  // nama di daftar ini (dipilih acak di antara yang cocok) — nama di luar daftar ini tidak akan
  // pernah menang selama daftar ini tidak kosong. Pencocokan case-insensitive & spasi di-trim,
  // jadi 'farhan' di sini tetap cocok walau di wheel ditulis 'Farhan Qolbi'.
  // Kosongkan array ini ( [] ) untuk kembali ke random murni terhadap semua entri.
  // Wheel tetap berputar normal (jumlah putaran, durasi, easing semua sama) — cuma hasil akhirnya
  // yang dibatasi ke daftar ini, jadi dari sisi visual tetap terlihat acak.
  const FORCED_WINNERS = [
    'nisa cherani',
    'nisa albantania',
    'dendi',
    'nurfalah',
    'usman',
  ];

  let entries = [];
  let title = 'Spin Wheel';
  let removeWinnerOnSpin = true;
  let soundOn = true;
  let confettiOn = true;
  let spinDuration = 6; // seconds
  let currentRotation = 0; // degrees, persists between spins
  let spinning = false;

  // ---------- elements ----------
  const el = {
    title: document.getElementById('wheelTitle'),
    canvas: document.getElementById('wheelCanvas'),
    hub: document.getElementById('hubBtn'),
    spinBtn: document.getElementById('spinBtn'),
    entriesArea: document.getElementById('entriesArea'),
    entryCountHint: document.getElementById('entryCountHint'),
    quickAddInput: document.getElementById('quickAddInput'),
    quickAddBtn: document.getElementById('quickAddBtn'),
    shuffleBtn: document.getElementById('shuffleBtn'),
    sortBtn: document.getElementById('sortBtn'),
    clearBtn: document.getElementById('clearBtn'),
    removeWinnerToggle: document.getElementById('removeWinnerToggle'),
    soundToggle: document.getElementById('soundToggle'),
    confettiToggle: document.getElementById('confettiToggle'),
    durationRange: document.getElementById('durationRange'),
    durationValue: document.getElementById('durationValue'),
    modal: document.getElementById('winnerModal'),
    winnerName: document.getElementById('winnerName'),
    removeAndCloseBtn: document.getElementById('removeAndCloseBtn'),
    spinAgainBtn: document.getElementById('spinAgainBtn'),
    closeModalBtn: document.getElementById('closeModalBtn'),
    confettiCanvas: document.getElementById('confettiCanvas'),
    wheelWrap: document.getElementById('wheelWrap'),
    fullscreenBtn: document.getElementById('fullscreenBtn'),
    tabBtns: document.querySelectorAll('.tab-btn'),
    tabContents: document.querySelectorAll('.tab-content'),
  };

  const ctx = el.canvas.getContext('2d');
  const confettiCtx = el.confettiCanvas.getContext('2d');

  // ---------- persistence ----------
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        entries = ['Andi', 'Budi', 'Citra', 'Dewi', 'Eka'];
        return;
      }
      const data = JSON.parse(raw);
      entries = Array.isArray(data.entries) && data.entries.length ? data.entries : ['Andi', 'Budi', 'Citra'];
      title = data.title || title;
      removeWinnerOnSpin = !!data.removeWinnerOnSpin;
      soundOn = data.soundOn !== false;
      confettiOn = data.confettiOn !== false;
      spinDuration = data.spinDuration || 6;
    } catch (e) {
      entries = ['Andi', 'Budi', 'Citra'];
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        entries, title, removeWinnerOnSpin, soundOn, confettiOn, spinDuration
      }));
    } catch (e) { /* ignore quota errors */ }
  }

  // ---------- wheel drawing ----------
  function getSize() {
    return el.canvas.width; // square canvas, internal resolution fixed at 640
  }

  function drawWheel() {
    const size = getSize();
    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 6;
    ctx.clearRect(0, 0, size, size);

    const n = entries.length;
    if (n === 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#e9eaf2';
      ctx.fill();
      ctx.fillStyle = '#9096a8';
      ctx.font = '600 22px Poppins, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Tambahkan entri untuk memulai', cx, cy);
      return;
    }

    const seg = (Math.PI * 2) / n;
    const start = -Math.PI / 2; // top of circle

    for (let i = 0; i < n; i++) {
      const a0 = start + i * seg;
      const a1 = start + (i + 1) * seg;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, a0, a1);
      ctx.closePath();
      ctx.fillStyle = PALETTE[i % PALETTE.length];
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // labels
    ctx.save();
    ctx.translate(cx, cy);
    for (let i = 0; i < n; i++) {
      const mid = start + i * seg + seg / 2;
      ctx.save();
      ctx.rotate(mid);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = textColorFor(PALETTE[i % PALETTE.length]);
      const fontSize = clamp(Math.floor(radius / 14), 12, 22);
      ctx.font = `600 ${fontSize}px Poppins, sans-serif`;
      const label = truncateLabel(entries[i], radius, fontSize);
      ctx.fillText(label, radius - 18, 0);
      ctx.restore();
    }
    ctx.restore();

    // center hub ring (visual only, actual button sits on top via CSS)
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.17, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  function truncateLabel(text, radius, fontSize) {
    const maxChars = Math.max(6, Math.floor((radius * 0.72) / (fontSize * 0.55)));
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars - 1) + '…';
  }

  function textColorFor(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? '#1f2430' : '#ffffff';
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  // ---------- entries sync ----------
  function syncTextareaFromEntries() {
    el.entriesArea.value = entries.join('\n');
    el.entryCountHint.textContent = `${entries.length} entri`;
  }

  function syncEntriesFromTextarea() {
    entries = el.entriesArea.value
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    el.entryCountHint.textContent = `${entries.length} entri`;
    drawWheel();
    saveState();
  }

  // ---------- spin logic ----------
  function pickWinnerIndex() {
    if (FORCED_WINNERS && FORCED_WINNERS.length) {
      const targets = FORCED_WINNERS.map(n => n.trim().toLowerCase());
      const candidateIndexes = entries.reduce((acc, name, i) => {
        if (targets.includes(name.trim().toLowerCase())) acc.push(i);
        return acc;
      }, []);
      if (candidateIndexes.length) {
        return candidateIndexes[Math.floor(Math.random() * candidateIndexes.length)];
      }
      console.warn('[SpinWheel] Tidak ada entri yang cocok dengan FORCED_WINNERS, kembali ke random.', FORCED_WINNERS);
    }
    return Math.floor(Math.random() * entries.length);
  }

  function spin() {
    if (spinning || entries.length < 2) {
      if (entries.length < 2) {
        flashHint('Butuh minimal 2 entri untuk berputar');
      }
      return;
    }
    spinning = true;
    el.hub.disabled = true;
    el.spinBtn.disabled = true;

    const n = entries.length;
    const segDeg = 360 / n;
    const winnerIndex = pickWinnerIndex();

    // angle (0-360) of the middle of the winning segment, measured from top, clockwise
    const winnerMid = winnerIndex * segDeg + segDeg / 2;
    // small random jitter within the segment so it doesn't always land dead-center
    const jitter = (Math.random() - 0.5) * segDeg * 0.7;

    // we need finalRotation such that (360 - finalRotation % 360) % 360 == winnerMid + jitter
    const targetEffective = (winnerMid + jitter + 360) % 360;
    const extraSpins = 6 + Math.floor(Math.random() * 3); // 6-8 full spins
    const currentMod = ((currentRotation % 360) + 360) % 360;
    let delta = (360 - targetEffective) - currentMod;
    delta = ((delta % 360) + 360) % 360;
    const finalRotation = currentRotation + extraSpins * 360 + delta;

    animateRotation(currentRotation, finalRotation, spinDuration * 1000, () => {
      currentRotation = finalRotation;
      spinning = false;
      el.hub.disabled = false;
      el.spinBtn.disabled = false;
      announceWinner(entries[winnerIndex]);
    });

    if (soundOn) playTickLoop(spinDuration * 1000);
  }

  function animateRotation(from, to, durationMs, onDone) {
    const startTime = performance.now();
    function frame(now) {
      const elapsed = now - startTime;
      const t = clamp(elapsed / durationMs, 0, 1);
      const eased = easeOutQuint(t);
      const angle = from + (to - from) * eased;
      el.canvas.style.transform = `rotate(${angle}deg)`;
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        onDone();
      }
    }
    requestAnimationFrame(frame);
  }

  function easeOutQuint(t) { return 1 - Math.pow(1 - t, 5); }

  // ---------- sound (Web Audio, no external files) ----------
  let audioCtx = null;
  function playTickLoop(totalMs) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const n = entries.length;
      const segDeg = 360 / n;
      // approximate number of segment-crossings during the spin, decelerating
      const totalTicks = Math.max(16, Math.floor(totalMs / 90));
      let i = 0;
      function tick() {
        if (i >= totalTicks || !spinning) return;
        const progress = i / totalTicks;
        const delay = 40 + progress * progress * 260; // slows down like real wheel
        playBeep();
        i++;
        setTimeout(tick, delay);
      }
      tick();
    } catch (e) { /* audio unsupported, ignore */ }
  }

  function playBeep() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.value = 700;
    gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.05);
  }

  // ---------- winner modal ----------
  let lastWinner = null;
  function announceWinner(name) {
    lastWinner = name;
    el.winnerName.textContent = name;
    el.modal.classList.remove('hidden');
    if (confettiOn) launchConfetti();
  }

  function closeModal() {
    if (removeWinnerOnSpin && lastWinner) {
      removeEntry(lastWinner);
    }
    el.modal.classList.add('hidden');
    stopConfetti();
  }

  function removeEntry(name) {
    const idx = entries.indexOf(name);
    if (idx !== -1) {
      entries.splice(idx, 1);
      syncTextareaFromEntries();
      drawWheel();
      saveState();
    }
  }

  // ---------- confetti ----------
  let confettiParticles = [];
  let confettiRAF = null;
  function resizeConfettiCanvas() {
    const stage = document.querySelector('.wheel-stage');
    el.confettiCanvas.width = stage.clientWidth;
    el.confettiCanvas.height = stage.clientHeight;
  }
  function launchConfetti() {
    resizeConfettiCanvas();
    confettiParticles = [];
    const colors = PALETTE;
    for (let i = 0; i < 140; i++) {
      confettiParticles.push({
        x: el.confettiCanvas.width / 2,
        y: el.confettiCanvas.height / 2,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 1.6) * 12,
        size: 5 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.3,
        life: 0,
      });
    }
    if (confettiRAF) cancelAnimationFrame(confettiRAF);
    animateConfetti();
  }
  function animateConfetti() {
    confettiCtx.clearRect(0, 0, el.confettiCanvas.width, el.confettiCanvas.height);
    let alive = false;
    for (const p of confettiParticles) {
      p.vy += 0.35; // gravity
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life++;
      if (p.life < 140) {
        alive = true;
        confettiCtx.save();
        confettiCtx.translate(p.x, p.y);
        confettiCtx.rotate(p.rot);
        confettiCtx.fillStyle = p.color;
        confettiCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        confettiCtx.restore();
      }
    }
    if (alive) {
      confettiRAF = requestAnimationFrame(animateConfetti);
    } else {
      stopConfetti();
    }
  }
  function stopConfetti() {
    if (confettiRAF) cancelAnimationFrame(confettiRAF);
    confettiRAF = null;
    confettiCtx.clearRect(0, 0, el.confettiCanvas.width, el.confettiCanvas.height);
  }

  function flashHint(msg) {
    const original = el.entryCountHint.textContent;
    el.entryCountHint.textContent = msg;
    el.entryCountHint.style.color = '#ee2f2f';
    setTimeout(() => {
      el.entryCountHint.textContent = original;
      el.entryCountHint.style.color = '';
    }, 1800);
  }

  // ---------- events ----------
  function bindEvents() {
    el.title.addEventListener('input', () => {
      title = el.title.value || 'Spin Wheel';
      document.title = title;
      saveState();
    });

    el.entriesArea.addEventListener('input', syncEntriesFromTextarea);

    el.quickAddBtn.addEventListener('click', quickAdd);
    el.quickAddInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); quickAdd(); }
    });
    function quickAdd() {
      const val = el.quickAddInput.value.trim();
      if (!val) return;
      entries.push(val);
      el.quickAddInput.value = '';
      syncTextareaFromEntries();
      drawWheel();
      saveState();
    }

    el.shuffleBtn.addEventListener('click', () => {
      for (let i = entries.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [entries[i], entries[j]] = [entries[j], entries[i]];
      }
      syncTextareaFromEntries();
      drawWheel();
      saveState();
    });

    el.sortBtn.addEventListener('click', () => {
      entries.sort((a, b) => a.localeCompare(b, 'id'));
      syncTextareaFromEntries();
      drawWheel();
      saveState();
    });

    el.clearBtn.addEventListener('click', () => {
      if (entries.length && !confirm('Hapus semua entri?')) return;
      entries = [];
      syncTextareaFromEntries();
      drawWheel();
      saveState();
    });

    el.hub.addEventListener('click', spin);
    el.spinBtn.addEventListener('click', spin);
    el.spinAgainBtn.addEventListener('click', () => { closeModal(); setTimeout(spin, 150); });
    el.removeAndCloseBtn.addEventListener('click', () => {
      if (lastWinner) removeEntry(lastWinner);
      closeModal();
    });
    el.closeModalBtn.addEventListener('click', closeModal);
    el.modal.addEventListener('click', (e) => { if (e.target === el.modal) closeModal(); });

    el.removeWinnerToggle.addEventListener('change', () => {
      removeWinnerOnSpin = el.removeWinnerToggle.checked;
      saveState();
    });
    el.soundToggle.addEventListener('change', () => {
      soundOn = el.soundToggle.checked;
      saveState();
    });
    el.confettiToggle.addEventListener('change', () => {
      confettiOn = el.confettiToggle.checked;
      saveState();
    });
    el.durationRange.addEventListener('input', () => {
      spinDuration = parseFloat(el.durationRange.value);
      el.durationValue.textContent = `${spinDuration.toFixed(1)} dtk`;
      saveState();
    });

    el.fullscreenBtn.addEventListener('click', () => {
      const stage = document.querySelector('.wheel-stage');
      if (!document.fullscreenElement) {
        stage.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
    });

    el.tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        el.tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.dataset.tab;
        el.tabContents.forEach(c => c.classList.toggle('hidden', c.id !== `tab-${target}`));
      });
    });

    window.addEventListener('resize', () => {
      if (!el.modal.classList.contains('hidden')) resizeConfettiCanvas();
    });
  }

  // ---------- init ----------
  function init() {
    loadState();
    el.title.value = title;
    document.title = title;
    el.removeWinnerToggle.checked = removeWinnerOnSpin;
    el.soundToggle.checked = soundOn;
    el.confettiToggle.checked = confettiOn;
    el.durationRange.value = spinDuration;
    el.durationValue.textContent = `${spinDuration.toFixed(1)} dtk`;

    syncTextareaFromEntries();
    drawWheel();
    bindEvents();
  }

  init();
})();
