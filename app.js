/* ==========================================================
   FinKit — Toolkit Keuangan Harian
   JavaScript murni, tanpa dependensi.
   ========================================================== */
'use strict';

(() => {
  /* ---------------- Utilitas ---------------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const store = {
    get(k, d = null) {
      try { const v = localStorage.getItem('finkit:' + k); return v === null ? d : JSON.parse(v); }
      catch { return d; }
    },
    set(k, v) { try { localStorage.setItem('finkit:' + k, JSON.stringify(v)); } catch { /* penyimpanan penuh/diblokir */ } },
    del(k) { try { localStorage.removeItem('finkit:' + k); } catch { /* abaikan */ } }
  };

  const debounce = (fn, ms = 250) => {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  };

  const fmt = (n, max = 2, min = 0) =>
    Number.isFinite(n)
      ? new Intl.NumberFormat('id-ID', { maximumFractionDigits: max, minimumFractionDigits: min }).format(n)
      : '—';

  const rp = (n) => (Number.isFinite(n) ? 'Rp' + fmt(n, 0) : '—');
  const rp2 = (n) => (Number.isFinite(n) ? 'Rp' + fmt(n, 2, 0) : '—');

  // "1.250,50" -> 1250.5 (titik = pemisah ribuan, koma = desimal)
  const parseNum = (s) => {
    if (typeof s === 'number') return s;
    const t = String(s ?? '').replace(/\./g, '').replace(',', '.');
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : 0;
  };

  // Rate: tampilkan angka bermakna sesuai besarnya
  const fmtRate = (n) => {
    if (!Number.isFinite(n)) return '—';
    const a = Math.abs(n);
    if (a >= 1000) return fmt(n, 2);
    if (a >= 1) return fmt(n, 4);
    return new Intl.NumberFormat('id-ID', { maximumSignificantDigits: 5 }).format(n);
  };

  const money = (n, code) => {
    if (!Number.isFinite(n)) return '—';
    const a = Math.abs(n);
    const opt = a > 0 && a < 1
      ? { maximumSignificantDigits: 4 }
      : { minimumFractionDigits: 0, maximumFractionDigits: a >= 1000 ? 0 : 2 };
    try {
      return new Intl.NumberFormat('id-ID', { style: 'currency', currency: code, ...opt }).format(n);
    } catch {
      return `${fmt(n, 2)} ${code}`;
    }
  };

  const fmtDate = (iso, opt = { day: 'numeric', month: 'short', year: 'numeric' }) => {
    const d = new Date(iso + 'T00:00:00');
    return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat('id-ID', opt).format(d);
  };

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { el.hidden = true; }, 2000);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* abaikan */ }
      ta.remove();
    }
    toast('Tersalin ke clipboard ✓');
  }

  // Input angka berformat Indonesia (1.000.000,50) dengan posisi kursor terjaga
  function maskInput(el) {
    const maxDec = Number(el.dataset.dec ?? 2);
    el.addEventListener('input', () => {
      const pos = el.selectionStart ?? el.value.length;
      const keep = el.value.slice(0, pos).replace(/[^\d,]/g, '').length;
      const raw = el.value.replace(/[^\d,]/g, '');
      const ci = raw.indexOf(',');
      let int = ci >= 0 ? raw.slice(0, ci) : raw;
      const dec = ci >= 0 && maxDec > 0 ? raw.slice(ci + 1).replace(/,/g, '').slice(0, maxDec) : null;
      int = int.replace(/^0+(?=\d)/, '');
      const out = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (dec !== null ? ',' + dec : '');
      el.value = out;
      let count = 0, np = 0;
      for (; np < out.length && count < keep; np++) if (/[\d,]/.test(out[np])) count++;
      try { el.setSelectionRange(np, np); } catch { /* tipe input tak mendukung */ }
    });
  }

  const setMoney = (el, n, max = 6) => { el.value = fmt(n, max); };

  /* ---------------- Tema ---------------- */
  function initTheme() {
    const root = document.documentElement;
    const apply = (t) => {
      root.dataset.theme = t;
      const meta = $('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', t === 'dark' ? '#06112b' : '#1d4ed8');
    };
    apply(root.dataset.theme || 'light');
    $('#themeBtn').addEventListener('click', () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      apply(next);
      store.set('theme', next);
    });
  }

  /* ---------------- Tab ---------------- */
  let currentTab = 'converter';
  function initTabs() {
    const tabs = $$('.tab');
    const activate = (id, focus = false) => {
      currentTab = id;
      tabs.forEach((t) => {
        const on = t.dataset.tab === id;
        t.setAttribute('aria-selected', on);
        t.tabIndex = on ? 0 : -1;
        if (on && focus) t.focus();
      });
      $$('.panel').forEach((p) => { p.hidden = p.id !== 'tab-' + id; });
      store.set('tab', id);
      history.replaceState(null, '', '#' + id);
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => activate(t.dataset.tab));
      t.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const n = (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        activate(tabs[n].dataset.tab, true);
      });
    });
    const fromHash = location.hash.slice(1);
    const start = tabs.some((t) => t.dataset.tab === fromHash) ? fromHash : store.get('tab', 'converter');
    activate(tabs.some((t) => t.dataset.tab === start) ? start : 'converter');
  }

  /* ==========================================================
     KONVERTER MATA UANG
     ========================================================== */
  const API = 'https://api.frankfurter.dev/v1';
  const RATE_TTL = 30 * 60 * 1000;
  const POPULAR = ['IDR', 'USD', 'EUR', 'SGD', 'JPY', 'MYR', 'AUD', 'GBP', 'CNY', 'KRW', 'THB', 'CHF', 'HKD', 'INR', 'CAD'];
  const FALLBACK_CUR = {
    IDR: 'Indonesian Rupiah', USD: 'United States Dollar', EUR: 'Euro', SGD: 'Singapore Dollar',
    JPY: 'Japanese Yen', MYR: 'Malaysian Ringgit', AUD: 'Australian Dollar', GBP: 'British Pound',
    CNY: 'Chinese Renminbi Yuan', KRW: 'South Korean Won', THB: 'Thai Baht', CHF: 'Swiss Franc',
    HKD: 'Hong Kong Dollar', INR: 'Indian Rupee', CAD: 'Canadian Dollar'
  };

  const cv = {
    from: store.get('from', 'USD'),
    to: store.get('to', 'IDR'),
    range: store.get('range', 30),
    currencies: FALLBACK_CUR,
    data: null,
    tok: 0,
    chartTok: 0
  };

  async function fetchJSON(url, ms = 9000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  // Jika offline, turunkan kurs dari data base lain yang pernah tersimpan
  function deriveFromCache(base) {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith('finkit:rates:')) continue;
        const e = JSON.parse(localStorage.getItem(k));
        const b = e && e.rates && e.rates[base];
        if (!b) continue;
        const rates = {};
        for (const [c, v] of Object.entries(e.rates)) rates[c] = v / b;
        rates[base] = 1;
        return { ts: e.ts, date: e.date, rates, source: 'offline' };
      }
    } catch { /* abaikan */ }
    return null;
  }

  async function getRates(base, force = false) {
    const key = 'rates:' + base;
    const cached = store.get(key);
    if (cached && !force && Date.now() - cached.ts < RATE_TTL) return { ...cached, source: 'cache' };
    try {
      const data = await fetchJSON(`${API}/latest?base=${encodeURIComponent(base)}`);
      const entry = { ts: Date.now(), date: data.date, rates: { ...data.rates, [base]: 1 } };
      store.set(key, entry);
      return { ...entry, source: 'live' };
    } catch (e) {
      if (cached) return { ...cached, source: 'offline' };
      const derived = deriveFromCache(base);
      if (derived) return derived;
      throw e;
    }
  }

  async function loadCurrencies() {
    const c = store.get('currencies');
    if (c && Date.now() - c.ts < 7 * 864e5) return c.list;
    try {
      const list = await fetchJSON(`${API}/currencies`);
      store.set('currencies', { ts: Date.now(), list });
      return list;
    } catch {
      return (c && c.list) || FALLBACK_CUR;
    }
  }

  function fillSelect(sel, selected) {
    const codes = Object.keys(cv.currencies);
    const pop = POPULAR.filter((c) => codes.includes(c));
    const rest = codes.filter((c) => !pop.includes(c)).sort();
    const opt = (c) => `<option value="${c}">${c} — ${esc(cv.currencies[c])}</option>`;
    sel.innerHTML = `<optgroup label="Populer">${pop.map(opt).join('')}</optgroup>` +
      (rest.length ? `<optgroup label="Lainnya">${rest.map(opt).join('')}</optgroup>` : '');
    sel.value = codes.includes(selected) ? selected : pop[0];
  }

  function renderQuick() {
    const box = $('#cvQuick');
    const list = ['IDR', 'USD', 'EUR', 'SGD', 'JPY', 'MYR', 'AUD', 'GBP'].filter((c) => cv.currencies[c]);
    box.innerHTML = list.map((c) => `<button type="button" class="chip" data-c="${c}" aria-pressed="${c === cv.to}">${c}</button>`).join('');
  }

  function renderResult() {
    const d = cv.data;
    const amount = parseNum($('#cvAmount').value);
    const res = $('#cvResult');
    res.classList.remove('loading');
    if (!d) return;
    const rate = d.rates[cv.to];
    if (rate == null) {
      res.textContent = 'Kurs tidak tersedia';
      $('#cvRate').textContent = '';
      $('#cvRateRev').textContent = '';
      return;
    }
    $('#cvEquation').textContent = `${fmt(amount, 6)} ${cv.from} =`;
    res.textContent = money(amount * rate, cv.to);
    $('#cvRate').textContent = `1 ${cv.from} = ${fmtRate(rate)} ${cv.to}`;
    $('#cvRateRev').textContent = `1 ${cv.to} = ${fmtRate(1 / rate)} ${cv.from}`;

    const badge = $('#cvBadge');
    const labels = { live: 'Live', cache: 'Tersimpan', offline: 'Offline (data tersimpan)' };
    badge.dataset.state = d.source;
    badge.textContent = labels[d.source] || d.source;
    $('#cvDate').textContent = d.date ? `Kurs per ${fmtDate(d.date)}` : '';
  }

  function renderTable() {
    const d = cv.data;
    const ul = $('#cvTable');
    if (!d) { ul.innerHTML = ''; return; }
    const amount = parseNum($('#cvAmount').value);
    const codes = POPULAR.filter((c) => c !== cv.from && d.rates[c] != null).slice(0, 8);
    ul.innerHTML = codes.map((c) => `
      <li class="cv-row"><button type="button" data-c="${c}">
        <span>${c}<small>${esc(cv.currencies[c] || '')}</small></span>
        <b>${esc(money(amount * d.rates[c], c))}</b>
      </button></li>`).join('');
  }

  async function cvUpdate(force = false) {
    const tok = ++cv.tok;
    $('#cvResult').classList.add('loading');
    try {
      const data = await getRates(cv.from, force);
      if (tok !== cv.tok) return;
      cv.data = data;
      renderResult();
      renderTable();
      if (force) toast(data.source === 'live' ? 'Kurs diperbarui ✓' : 'Offline: memakai data tersimpan');
    } catch {
      if (tok !== cv.tok) return;
      cv.data = null;
      $('#cvResult').classList.remove('loading');
      $('#cvResult').textContent = 'Gagal memuat kurs';
      $('#cvRate').textContent = 'Periksa koneksi internet, lalu tekan "Perbarui kurs".';
      $('#cvRateRev').textContent = '';
      $('#cvBadge').dataset.state = 'error';
      $('#cvBadge').textContent = 'Error';
      $('#cvDate').textContent = '';
      $('#cvTable').innerHTML = '';
    }
    loadChart();
  }

  /* ----- Riwayat konversi ----- */
  let histTimer;
  const scheduleHistory = () => { clearTimeout(histTimer); histTimer = setTimeout(pushHistory, 1500); };

  function pushHistory() {
    if (!cv.data) return;
    const amount = parseNum($('#cvAmount').value);
    const rate = cv.data.rates[cv.to];
    if (!amount || rate == null) return;
    const item = { amount, from: cv.from, to: cv.to, out: amount * rate };
    let h = store.get('cvHist', []);
    if (h[0] && h[0].amount === item.amount && h[0].from === item.from && h[0].to === item.to) h.shift();
    h.unshift(item);
    h = h.slice(0, 8);
    store.set('cvHist', h);
    renderHistory();
  }

  function renderHistory() {
    const h = store.get('cvHist', []);
    const ul = $('#cvHist');
    if (!h.length) { ul.innerHTML = '<li class="empty">Belum ada riwayat. Mulai konversi untuk menyimpannya.</li>'; return; }
    ul.innerHTML = h.map((x, i) => `
      <li><button class="item" type="button" data-i="${i}">
        <span>${esc(fmt(x.amount, 4))} ${x.from} <small>→</small> ${x.to}</span>
        <b>${esc(money(x.out, x.to))}</b>
      </button></li>`).join('');
  }

  /* ----- Grafik tren ----- */
  async function loadChart() {
    const { from, to, range } = cv;
    const msg = $('#chartMsg');
    const tok = ++cv.chartTok;
    $('#chartTip').hidden = true;

    if (from === to) {
      $('#chart').innerHTML = '';
      $('#chartStats').innerHTML = '';
      msg.hidden = false;
      msg.textContent = 'Pilih dua mata uang yang berbeda untuk melihat tren.';
      return;
    }

    const end = new Date();
    const start = new Date(end.getTime() - range * 864e5);
    const iso = (d) => d.toISOString().slice(0, 10);
    const key = `series:${from}:${to}:${range}`;
    let points = null;
    const cached = store.get(key);
    if (cached && cached.day === iso(end)) points = cached.points;

    if (!points) {
      msg.hidden = false;
      msg.textContent = 'Memuat grafik…';
      try {
        const data = await fetchJSON(`${API}/${iso(start)}..${iso(end)}?base=${from}&symbols=${to}`, 12000);
        points = Object.entries(data.rates || {})
          .map(([d, v]) => ({ d, v: v[to] }))
          .filter((p) => Number.isFinite(p.v))
          .sort((a, b) => a.d.localeCompare(b.d));
        if (points.length) store.set(key, { day: iso(end), points });
      } catch {
        if (cached) points = cached.points;
      }
    }

    if (tok !== cv.chartTok) return;
    if (!points || points.length < 2) {
      $('#chart').innerHTML = '';
      $('#chartStats').innerHTML = '';
      msg.hidden = false;
      msg.textContent = 'Data grafik belum tersedia. Coba lagi saat online.';
      return;
    }
    msg.hidden = true;
    drawChart(points);
  }

  function drawChart(points) {
    const svg = $('#chart');
    const W = 640, H = 260, L = 62, R = 12, T = 14, B = 28;
    const vals = points.map((p) => p.v);
    let min = Math.min(...vals), max = Math.max(...vals);
    if (min === max) { const d = Math.abs(min) * 0.01 || 1; min -= d; max += d; }
    const pad = (max - min) * 0.12;
    min -= pad; max += pad;

    const x = (i) => L + (i / (points.length - 1)) * (W - L - R);
    const y = (v) => T + (1 - (v - min) / (max - min)) * (H - T - B);
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
    const area = `${line}L${x(points.length - 1).toFixed(1)},${H - B}L${x(0).toFixed(1)},${H - B}Z`;

    let grid = '';
    for (let k = 0; k < 4; k++) {
      const v = min + ((max - min) * k) / 3;
      const yy = y(v).toFixed(1);
      grid += `<line class="grid" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/><text x="${L - 8}" y="${Number(yy) + 4}" text-anchor="end">${esc(fmtRate(v))}</text>`;
    }
    const dl = (p) => fmtDate(p.d, { day: 'numeric', month: 'short' });
    const mid = points[Math.floor(points.length / 2)];
    const xl = `<text x="${L}" y="${H - 8}" text-anchor="start">${dl(points[0])}</text>
      <text x="${(L + W - R) / 2}" y="${H - 8}" text-anchor="middle">${dl(mid)}</text>
      <text x="${W - R}" y="${H - 8}" text-anchor="end">${dl(points[points.length - 1])}</text>`;

    svg.innerHTML = `
      <defs><linearGradient id="fillGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" style="stop-color:var(--primary);stop-opacity:.32"/>
        <stop offset="100%" style="stop-color:var(--primary);stop-opacity:0"/>
      </linearGradient></defs>
      ${grid}${xl}
      <path d="${area}" fill="url(#fillGrad)"/>
      <path class="line" d="${line}"/>
      <line class="cursor" id="cLine" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>
      <circle class="dot" id="cDot" r="5" visibility="hidden"/>`;

    const tip = $('#chartTip');
    const cLine = $('#cLine'), cDot = $('#cDot');
    const move = (ev) => {
      const rect = svg.getBoundingClientRect();
      const px = ((ev.clientX - rect.left) / rect.width) * W;
      let idx = Math.round(((px - L) / (W - L - R)) * (points.length - 1));
      idx = Math.max(0, Math.min(points.length - 1, idx));
      const p = points[idx];
      const cx = x(idx), cy = y(p.v);
      cLine.setAttribute('x1', cx); cLine.setAttribute('x2', cx); cLine.setAttribute('visibility', 'visible');
      cDot.setAttribute('cx', cx); cDot.setAttribute('cy', cy); cDot.setAttribute('visibility', 'visible');
      tip.hidden = false;
      tip.innerHTML = `<span>${esc(fmtDate(p.d))}</span><b>${esc(fmtRate(p.v))} ${cv.to}</b>`;
      tip.style.left = Math.max(14, Math.min(86, (cx / W) * 100)) + '%';
      tip.style.top = (cy / H) * 100 + '%';
    };
    const leave = () => { tip.hidden = true; cLine.setAttribute('visibility', 'hidden'); cDot.setAttribute('visibility', 'hidden'); };
    svg.onpointermove = move;
    svg.onpointerdown = move;
    svg.onpointerleave = leave;

    const first = points[0].v, last = points[points.length - 1].v;
    const chg = ((last - first) / first) * 100;
    const stat = (l, v, c = '') => `<div class="stat"><small>${l}</small><b class="${c}">${v}</b></div>`;
    $('#chartStats').innerHTML =
      stat('Awal', esc(fmtRate(first))) +
      stat('Terakhir', esc(fmtRate(last))) +
      stat('Perubahan', `${chg >= 0 ? '▲' : '▼'} ${fmt(Math.abs(chg), 2)}%`, chg >= 0 ? 'up' : 'down') +
      stat('Tertinggi', esc(fmtRate(Math.max(...vals)))) +
      stat('Terendah', esc(fmtRate(Math.min(...vals))));
  }

  async function initConverter() {
    const amount = $('#cvAmount');
    renderHistory();
    cv.currencies = await loadCurrencies();
    const from = $('#cvFrom'), to = $('#cvTo');
    fillSelect(from, cv.from);
    fillSelect(to, cv.to);
    cv.from = from.value;
    cv.to = to.value;
    renderQuick();
    $$('#rangeSeg .seg-btn').forEach((b) => b.setAttribute('aria-pressed', Number(b.dataset.range) === cv.range));

    amount.addEventListener('input', () => { renderResult(); renderTable(); scheduleHistory(); });

    from.addEventListener('change', () => {
      cv.from = from.value; store.set('from', cv.from);
      cvUpdate(); scheduleHistory();
    });
    to.addEventListener('change', () => {
      cv.to = to.value; store.set('to', cv.to);
      renderQuick(); renderResult(); renderTable(); loadChart(); scheduleHistory();
    });

    $('#cvSwap').addEventListener('click', (e) => {
      e.currentTarget.classList.toggle('spin');
      [cv.from, cv.to] = [cv.to, cv.from];
      from.value = cv.from; to.value = cv.to;
      store.set('from', cv.from); store.set('to', cv.to);
      renderQuick();
      cvUpdate(); scheduleHistory();
    });

    $('#cvQuick').addEventListener('click', (e) => {
      const b = e.target.closest('[data-c]');
      if (!b) return;
      cv.to = b.dataset.c; to.value = cv.to; store.set('to', cv.to);
      renderQuick(); renderResult(); renderTable(); loadChart(); scheduleHistory();
    });

    $('#cvTable').addEventListener('click', (e) => {
      const b = e.target.closest('[data-c]');
      if (!b) return;
      cv.to = b.dataset.c; to.value = cv.to; store.set('to', cv.to);
      renderQuick(); renderResult(); renderTable(); loadChart(); scheduleHistory();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    $('#cvRefresh').addEventListener('click', () => cvUpdate(true));
    $('#cvCopy').addEventListener('click', () => {
      if (!cv.data || cv.data.rates[cv.to] == null) return toast('Belum ada hasil');
      const a = parseNum(amount.value);
      copyText(`${fmt(a, 6)} ${cv.from} = ${money(a * cv.data.rates[cv.to], cv.to)}`);
    });

    $('#cvHist').addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      const x = store.get('cvHist', [])[Number(b.dataset.i)];
      if (!x) return;
      cv.from = x.from; cv.to = x.to;
      from.value = x.from; to.value = x.to;
      setMoney(amount, x.amount);
      store.set('from', cv.from); store.set('to', cv.to);
      renderQuick(); cvUpdate();
    });
    $('#cvHistClear').addEventListener('click', () => { store.del('cvHist'); renderHistory(); toast('Riwayat dihapus'); });

    $('#rangeSeg').addEventListener('click', (e) => {
      const b = e.target.closest('[data-range]');
      if (!b) return;
      cv.range = Number(b.dataset.range);
      store.set('range', cv.range);
      $$('#rangeSeg .seg-btn').forEach((x) => x.setAttribute('aria-pressed', x === b));
      loadChart();
    });

    await cvUpdate();

    // Segarkan berkala saat tab terlihat
    setInterval(() => { if (!document.hidden && navigator.onLine) cvUpdate(); }, RATE_TTL);
    window.addEventListener('online', () => cvUpdate(true));
  }

  /* ==========================================================
     KALKULATOR (parser sendiri — tanpa eval)
     ========================================================== */
  class CalcError extends Error {}

  const calc = {
    expr: '',
    ans: 0,
    done: false,
    deg: true,
    sci: false,
    hist: store.get('calcHist', [])
  };

  const toRad = (x) => (calc.deg ? (x * Math.PI) / 180 : x);
  const FUNCS = {
    sqrt: (x) => { if (x < 0) throw new CalcError('Akar bilangan negatif'); return Math.sqrt(x); },
    sin: (x) => Math.sin(toRad(x)),
    cos: (x) => Math.cos(toRad(x)),
    tan: (x) => {
      const r = Math.tan(toRad(x));
      if (Math.abs(r) > 1e14) throw new CalcError('Tan tidak terdefinisi');
      return r;
    },
    log: (x) => { if (x <= 0) throw new CalcError('Log hanya untuk bilangan positif'); return Math.log10(x); },
    ln: (x) => { if (x <= 0) throw new CalcError('Ln hanya untuk bilangan positif'); return Math.log(x); },
    abs: Math.abs
  };

  function tokenize(src) {
    const s = src.replace(/\s+/g, '');
    const toks = [];
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (/[0-9.]/.test(ch)) {
        let j = i;
        while (j < s.length && /[0-9.]/.test(s[j])) j++;
        const t = s.slice(i, j);
        if ((t.match(/\./g) || []).length > 1 || t === '.') throw new CalcError('Angka tidak valid');
        toks.push({ t: 'num', v: parseFloat(t) });
        i = j;
      } else if ('+-*/^%()'.includes(ch)) {
        toks.push({ t: ch });
        i++;
      } else if (/[a-z]/i.test(ch)) {
        let j = i;
        while (j < s.length && /[a-z]/i.test(s[j])) j++;
        const name = s.slice(i, j).toLowerCase();
        if (['pi', 'e', 'ans'].includes(name)) toks.push({ t: 'const', v: name });
        else if (FUNCS[name]) toks.push({ t: 'fn', v: name });
        else throw new CalcError('Fungsi tidak dikenal');
        i = j;
      } else {
        throw new CalcError('Karakter tidak dikenal');
      }
    }
    return toks;
  }

  class Parser {
    constructor(toks) { this.t = toks; this.i = 0; this.pctOnly = false; }
    peek() { return this.t[this.i]; }
    next() { return this.t[this.i++]; }
    parse() {
      const v = this.expr();
      if (this.i < this.t.length) throw new CalcError('Ekspresi tidak valid');
      return v;
    }
    expr() {
      let v = this.term();
      while (this.peek() && (this.peek().t === '+' || this.peek().t === '-')) {
        const op = this.next().t;
        const r = this.term();
        // 200 + 10% => 200 + 10% dari 200
        const rr = this.pctOnly ? v * r : r;
        v = op === '+' ? v + rr : v - rr;
      }
      return v;
    }
    term() {
      const start = this.i;
      let v = this.unary();
      for (;;) {
        const p = this.peek();
        if (!p) break;
        if (p.t === '*' || p.t === '/') {
          this.next();
          const r = this.unary();
          if (p.t === '/') {
            if (r === 0) throw new CalcError('Tidak bisa dibagi nol');
            v /= r;
          } else v *= r;
        } else if (p.t === '(' || p.t === 'fn' || p.t === 'const' || p.t === 'num') {
          v *= this.unary(); // perkalian implisit: 2(3+4), 2π
        } else break;
      }
      this.pctOnly = this.i === start + 2 && this.t[start].t === 'num' && this.t[start + 1].t === '%';
      return v;
    }
    unary() {
      const p = this.peek();
      if (p && p.t === '-') { this.next(); return -this.unary(); }
      if (p && p.t === '+') { this.next(); return this.unary(); }
      return this.power();
    }
    power() {
      const base = this.postfix();
      if (this.peek() && this.peek().t === '^') {
        this.next();
        return Math.pow(base, this.unary());
      }
      return base;
    }
    postfix() {
      let v = this.primary();
      while (this.peek() && this.peek().t === '%') { this.next(); v /= 100; }
      return v;
    }
    primary() {
      const tok = this.next();
      if (!tok) throw new CalcError('Ekspresi belum lengkap');
      switch (tok.t) {
        case 'num': return tok.v;
        case 'const': return tok.v === 'pi' ? Math.PI : tok.v === 'e' ? Math.E : calc.ans;
        case 'fn': {
          const open = this.next();
          if (!open || open.t !== '(') throw new CalcError('Ekspresi tidak valid');
          const arg = this.expr();
          const close = this.next();
          if (!close || close.t !== ')') throw new CalcError('Kurung tidak seimbang');
          return FUNCS[tok.v](arg);
        }
        case '(': {
          const v = this.expr();
          const close = this.next();
          if (!close || close.t !== ')') throw new CalcError('Kurung tidak seimbang');
          return v;
        }
        default: throw new CalcError('Ekspresi tidak valid');
      }
    }
  }

  function evaluate(expr) {
    let s = expr.replace(/[+\-*/^]+$/, '');
    if (!s) return null;
    let open = 0;
    for (const ch of s) {
      if (ch === '(') open++;
      else if (ch === ')') { open--; if (open < 0) throw new CalcError('Kurung tidak seimbang'); }
    }
    s += ')'.repeat(open);
    const v = new Parser(tokenize(s)).parse();
    if (!Number.isFinite(v)) throw new CalcError('Hasil tidak terdefinisi');
    if (Math.abs(v) < 1e-12) return 0;
    return parseFloat(v.toPrecision(12));
  }

  const fmtCalc = (n) => {
    const a = Math.abs(n);
    if (a !== 0 && (a >= 1e15 || a < 1e-9)) return n.toExponential(6).replace('.', ',').replace(/,?0+e/, 'e');
    return fmt(n, 10);
  };
  const showExpr = (e) => e.replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−').replace(/\./g, ',')
    .replace(/sqrt\(/g, '√(').replace(/pi/g, 'π');

  function renderCalc(finalErr = null) {
    $('#calcExpr').innerHTML = calc.expr ? esc(showExpr(calc.expr)) : '&nbsp;';
    const out = $('#calcResult');
    out.classList.remove('preview', 'err');
    if (finalErr) {
      out.textContent = finalErr;
      out.classList.add('err');
      return;
    }
    if (calc.done) { out.textContent = fmtCalc(calc.ans); return; }
    try {
      const v = calc.expr ? evaluate(calc.expr) : null;
      if (v === null || /^-?[\d.]+$/.test(calc.expr)) {
        out.textContent = calc.expr && /^[\d.]+$/.test(calc.expr) ? showExpr(calc.expr) : '0';
        if (calc.expr === '-') out.textContent = '−';
      } else {
        out.textContent = fmtCalc(v);
        out.classList.add('preview');
      }
    } catch {
      out.textContent = calc.expr ? showExpr(calc.expr.match(/[\d.]+$/)?.[0] || '0') : '0';
    }
  }

  function calcPress(k) {
    const last = calc.expr.slice(-1);
    const isOp = (c) => '+-*/^'.includes(c);
    const resetIfDone = () => { if (calc.done) { calc.expr = ''; calc.done = false; } };

    if (/^\d$/.test(k)) {
      resetIfDone();
      if (/(^|[^\d.])0$/.test(calc.expr)) calc.expr = calc.expr.slice(0, -1);
      calc.expr += k;
    } else if (k === '.') {
      resetIfDone();
      const num = calc.expr.match(/[\d.]*$/)[0];
      if (num.includes('.')) return;
      calc.expr += /\d$/.test(calc.expr) ? '.' : '0.';
    } else if ('+-*/^'.includes(k) && k.length === 1) {
      if (calc.done) { calc.expr = String(calc.ans); calc.done = false; }
      if (!calc.expr) { if (k === '-') calc.expr = '-'; return renderCalc(); }
      if (isOp(last)) {
        if (k === '-' && '*/^'.includes(last)) calc.expr += k;
        else calc.expr = calc.expr.replace(/[+\-*/^]+$/, '') + k;
      } else if (last === '(') {
        if (k === '-') calc.expr += k;
      } else calc.expr += k;
    } else if (k === '%') {
      if (/[\d)]$/.test(calc.expr)) { calc.done = false; calc.expr += '%'; }
    } else if (k === '(') {
      resetIfDone();
      calc.expr += '(';
    } else if (k === ')') {
      const open = (calc.expr.match(/\(/g) || []).length - (calc.expr.match(/\)/g) || []).length;
      if (open > 0 && /[\d)%]$|pi$|e$|ans$/.test(calc.expr)) calc.expr += ')';
    } else if (/\($/.test(k)) {
      resetIfDone();
      calc.expr += k;
    } else if (k === 'pi' || k === 'e' || k === 'ans') {
      resetIfDone();
      calc.expr += k;
    } else if (k === 'sq') {
      if (calc.done) { calc.expr = String(calc.ans); calc.done = false; }
      if (/[\d)]$/.test(calc.expr)) calc.expr += '^2';
    } else if (k === 'C') {
      calc.expr = ''; calc.done = false;
    } else if (k === 'DEL') {
      if (calc.done) { calc.expr = ''; calc.done = false; }
      else calc.expr = calc.expr.replace(/(sqrt\(|sin\(|cos\(|tan\(|log\(|ln\(|abs\(|pi|ans|.)$/, '');
    } else if (k === 'neg') {
      if (calc.done) { calc.expr = String(calc.ans); calc.done = false; }
      if (!calc.expr) calc.expr = '-';
      else if (/^-\(.*\)$/.test(calc.expr)) calc.expr = calc.expr.slice(2, -1);
      else calc.expr = '-(' + calc.expr + ')';
    } else if (k === '=') {
      if (!calc.expr || calc.done) return;
      try {
        const v = evaluate(calc.expr);
        if (v === null) return;
        const shown = showExpr(calc.expr);
        calc.hist.unshift({ expr: shown, res: v });
        calc.hist = calc.hist.slice(0, 30);
        store.set('calcHist', calc.hist);
        calc.ans = v;
        calc.done = true;
        renderCalcHist();
        return renderCalc();
      } catch (e) {
        return renderCalc(e instanceof CalcError ? e.message : 'Ekspresi tidak valid');
      }
    }
    renderCalc();
  }

  function renderCalcHist() {
    const ul = $('#calcHist');
    if (!calc.hist.length) { ul.innerHTML = '<li class="empty">Belum ada perhitungan.</li>'; return; }
    ul.innerHTML = calc.hist.map((h, i) => `
      <li><button class="item" type="button" data-i="${i}">
        <small>${esc(h.expr)} =</small><b>${esc(fmtCalc(h.res))}</b>
      </button></li>`).join('');
  }

  function initCalculator() {
    $('#mainKeys').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) calcPress(b.dataset.k); });
    $('#sciKeys').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) calcPress(b.dataset.k); });

    $('#sciToggle').addEventListener('click', (e) => {
      calc.sci = !calc.sci;
      e.currentTarget.setAttribute('aria-pressed', calc.sci);
      $('#sciKeys').hidden = !calc.sci;
    });
    $('#degToggle').addEventListener('click', (e) => {
      calc.deg = !calc.deg;
      e.currentTarget.setAttribute('aria-pressed', calc.deg);
      e.currentTarget.textContent = calc.deg ? 'DEG' : 'RAD';
      renderCalc();
    });

    $('#calcHist').addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      const h = calc.hist[Number(b.dataset.i)];
      if (!h) return;
      calc.expr = String(h.res);
      calc.done = false;
      renderCalc();
    });
    $('#calcHistClear').addEventListener('click', () => { calc.hist = []; store.del('calcHist'); renderCalcHist(); });
    $('#calcCopy').addEventListener('click', () => copyText(fmtCalc(calc.ans)));

    document.addEventListener('keydown', (e) => {
      if (currentTab !== 'calculator' || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (['input', 'select', 'textarea'].includes(tag)) return;
      let k = null;
      if (/^\d$/.test(e.key)) k = e.key;
      else if ('+-*/^()%'.includes(e.key) && e.key.length === 1) k = e.key;
      else if (e.key === '.' || e.key === ',') k = '.';
      else if (e.key === 'Enter' || e.key === '=') k = '=';
      else if (e.key === 'Backspace') k = 'DEL';
      else if (e.key === 'Escape') k = 'C';
      if (!k) return;
      e.preventDefault();
      const btn = $(`#tab-calculator [data-k="${CSS.escape(k)}"]`);
      if (btn) { btn.classList.add('press'); setTimeout(() => btn.classList.remove('press'), 110); }
      calcPress(k);
    });

    renderCalcHist();
    renderCalc();
  }

  /* ==========================================================
     SIMULASI CICILAN
     ========================================================== */
  let loanRows = [];
  let loanAll = false;

  function computeLoan() {
    const P = parseNum($('#lnAmount').value);
    const rate = parseNum($('#lnRate').value);
    let n = Math.round(parseNum($('#lnTenor').value));
    if ($('#lnUnit').value === 'year') n *= 12;
    const method = $('#lnMethod').value;
    const err = $('#lnError');

    let msg = '';
    if (!(P > 0)) msg = 'Masukkan jumlah pinjaman yang valid.';
    else if (!(n >= 1)) msg = 'Tenor minimal 1 bulan.';
    else if (n > 600) msg = 'Tenor maksimal 600 bulan (50 tahun).';
    else if (rate < 0 || rate > 200) msg = 'Bunga harus antara 0% dan 200%.';
    err.hidden = !msg;
    err.textContent = msg;
    if (msg) {
      loanRows = [];
      ['#lnMonthly', '#lnInterest', '#lnTotal'].forEach((s) => { $(s).textContent = '—'; });
      $('#lnTable').innerHTML = '';
      $('#lnMore').hidden = true;
      return;
    }

    const r = rate / 1200;
    const rows = [];
    let bal = P;
    if (method === 'annuity') {
      const pmt = r === 0 ? P / n : (P * r) / (1 - Math.pow(1 + r, -n));
      for (let i = 1; i <= n; i++) {
        const interest = bal * r;
        const principal = i === n ? bal : pmt - interest;
        bal = Math.max(0, bal - principal);
        rows.push({ i, principal, interest, pay: principal + interest, bal });
      }
    } else if (method === 'flat') {
      const totalInt = P * (rate / 100) * (n / 12);
      for (let i = 1; i <= n; i++) {
        const principal = P / n;
        const interest = totalInt / n;
        bal = Math.max(0, bal - principal);
        rows.push({ i, principal, interest, pay: principal + interest, bal });
      }
    } else {
      for (let i = 1; i <= n; i++) {
        const principal = P / n;
        const interest = bal * r;
        bal = Math.max(0, bal - principal);
        rows.push({ i, principal, interest, pay: principal + interest, bal });
      }
    }
    loanRows = rows;

    const totalInterest = rows.reduce((a, x) => a + x.interest, 0);
    const total = P + totalInterest;
    const lbl = $('#lnMonthlyLabel');
    if (method === 'sliding') {
      lbl.textContent = 'Cicilan (awal → akhir)';
      $('#lnMonthly').textContent = `${rp(rows[0].pay)} → ${rp(rows[n - 1].pay)}`;
    } else {
      lbl.textContent = 'Cicilan per bulan';
      $('#lnMonthly').textContent = rp(rows[0].pay);
    }
    $('#lnInterest').textContent = rp(totalInterest);
    $('#lnTotal').textContent = rp(total);

    const pct = Math.round((P / total) * 100);
    $('#loanDonut').style.setProperty('--p', pct);
    $('#loanPct').textContent = pct + '%';
    renderLoanTable();
  }

  function renderLoanTable() {
    const rows = loanAll ? loanRows : loanRows.slice(0, 12);
    $('#lnTable').innerHTML = rows.map((x) =>
      `<tr><td>${x.i}</td><td>${fmt(x.principal, 0)}</td><td>${fmt(x.interest, 0)}</td><td>${fmt(x.pay, 0)}</td><td>${fmt(x.bal, 0)}</td></tr>`).join('');
    const more = $('#lnMore');
    more.hidden = loanRows.length <= 12;
    more.textContent = loanAll ? 'Tampilkan 12 bulan pertama' : `Tampilkan semua (${loanRows.length} bulan)`;
  }

  function initLoan() {
    ['#lnAmount', '#lnRate', '#lnTenor', '#lnUnit', '#lnMethod'].forEach((s) => {
      $(s).addEventListener('input', debounce(computeLoan, 120));
      $(s).addEventListener('change', computeLoan);
    });
    $('#lnMore').addEventListener('click', () => { loanAll = !loanAll; renderLoanTable(); });
    $('#lnCsv').addEventListener('click', () => {
      if (!loanRows.length) return toast('Belum ada data');
      const csv = ['Bulan,Pokok,Bunga,Cicilan,Sisa Pinjaman']
        .concat(loanRows.map((x) => [x.i, x.principal, x.interest, x.pay, x.bal].map((v, i) => (i ? v.toFixed(2) : v)).join(','))).join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      a.download = 'jadwal-angsuran.csv';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    computeLoan();
  }

  /* ==========================================================
     DISKON & PPN
     ========================================================== */
  let dcText = '';

  const rowsHTML = (rows) => rows.map(([l, v, c = '']) => `<li class="${c}"><span>${l}</span><b>${esc(v)}</b></li>`).join('');

  function computeDiscount() {
    const price = parseNum($('#dcPrice').value);
    const pct = Math.min(100, Math.max(0, parseNum($('#dcPct').value)));
    const cutRaw = parseNum($('#dcCut').value);
    const tax = Math.max(0, parseNum($('#dcTax').value)) / 100;
    const mode = $('input[name="dcMode"]:checked').value;

    const discPct = price * (pct / 100);
    const cut = Math.min(cutRaw, price - discPct);
    const afterDisc = Math.max(0, price - discPct - cut);

    let base, ppn, total;
    if (mode === 'ex') { base = afterDisc; ppn = base * tax; total = base + ppn; }
    else { total = afterDisc; base = total / (1 + tax); ppn = total - base; }

    const saved = discPct + cut;
    $('#dcTotal').textContent = rp2(total);
    const sv = $('#dcSave');
    sv.textContent = saved > 0 ? `Hemat ${rp2(saved)}` : 'Tanpa diskon';
    sv.dataset.state = saved > 0 ? 'live' : 'cache';

    const rows = [
      ['Harga awal', rp2(price)],
      [`Diskon ${fmt(pct, 2)}%`, '− ' + rp2(discPct), 'minus'],
      ['Potongan tambahan', '− ' + rp2(cut), 'minus'],
      [mode === 'ex' ? 'Harga setelah diskon' : 'Harga setelah diskon (termasuk PPN)', rp2(afterDisc)],
      ['DPP (sebelum PPN)', rp2(base)],
      [`PPN ${fmt(tax * 100, 2)}%`, rp2(ppn)],
      ['Total dibayar', rp2(total), 'total']
    ];
    $('#dcOut').innerHTML = rowsHTML(rows);
    dcText = rows.map(([l, v]) => `${l}: ${v}`).join('\n');
  }

  function initDiscount() {
    ['#dcPrice', '#dcPct', '#dcCut', '#dcTax'].forEach((s) => $(s).addEventListener('input', computeDiscount));
    $$('input[name="dcMode"]').forEach((r) => r.addEventListener('change', computeDiscount));
    $$('[data-tax]').forEach((b) => b.addEventListener('click', () => { $('#dcTax').value = b.dataset.tax; computeDiscount(); }));
    $('#dcCopy').addEventListener('click', () => copyText(dcText));
    computeDiscount();
  }

  /* ==========================================================
     SPLIT BILL
     ========================================================== */
  let spText = '';

  function computeSplit() {
    const sub = parseNum($('#spTotal').value);
    const sv = Math.max(0, parseNum($('#spService').value)) / 100;
    const tx = Math.max(0, parseNum($('#spTax').value)) / 100;
    const people = Math.min(99, Math.max(1, Math.round(Number($('#spPeople').value) || 1)));
    const step = Number($('#spRound').value);

    const service = sub * sv;
    const tax = (sub + service) * tx;
    const total = sub + service + tax;
    const exact = total / people;
    const per = step > 0 ? Math.ceil(exact / step - 1e-9) * step : exact;
    const collected = per * people;
    const extra = collected - total;

    $('#spPer').textContent = rp(per);
    const rows = [
      ['Subtotal', rp(sub)],
      [`Service ${fmt(sv * 100, 2)}%`, rp(service)],
      [`Pajak ${fmt(tx * 100, 2)}%`, rp(tax)],
      ['Total tagihan', rp(total), 'total'],
      ['Jumlah orang', String(people)],
      ['Per orang (tanpa pembulatan)', rp(exact)]
    ];
    if (step > 0) {
      rows.push(['Terkumpul setelah pembulatan', rp(collected)]);
      rows.push(['Kelebihan (bisa untuk tip)', rp(extra)]);
    }
    $('#spOut').innerHTML = rowsHTML(rows);
    spText = `Split bill — ${people} orang\nTotal tagihan: ${rp(total)}\nPer orang: ${rp(per)}`;
  }

  function initSplit() {
    ['#spTotal', '#spService', '#spTax', '#spPeople', '#spRound'].forEach((s) => {
      $(s).addEventListener('input', computeSplit);
      $(s).addEventListener('change', computeSplit);
    });
    const bump = (d) => {
      const el = $('#spPeople');
      el.value = Math.min(99, Math.max(1, (Number(el.value) || 1) + d));
      computeSplit();
    };
    $('#spMinus').addEventListener('click', () => bump(-1));
    $('#spPlus').addEventListener('click', () => bump(1));
    $('#spCopy').addEventListener('click', () => copyText(spText));
    computeSplit();
  }

  /* ==========================================================
     PWA, status jaringan
     ========================================================== */
  function initNetwork() {
    const pill = $('#netStatus');
    const upd = () => {
      const on = navigator.onLine;
      pill.dataset.state = on ? 'online' : 'offline';
      pill.textContent = on ? 'Online' : 'Offline';
    };
    window.addEventListener('online', () => { upd(); toast('Kembali online'); });
    window.addEventListener('offline', () => { upd(); toast('Anda offline — memakai data tersimpan'); });
    upd();
  }

  function initPWA() {
    let deferred = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferred = e;
      $('#installBtn').hidden = false;
    });
    $('#installBtn').addEventListener('click', async () => {
      if (!deferred) return;
      deferred.prompt();
      await deferred.userChoice;
      deferred = null;
      $('#installBtn').hidden = true;
    });
    window.addEventListener('appinstalled', () => { $('#installBtn').hidden = true; toast('Aplikasi terpasang ✓'); });

    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* abaikan */ });
    }
  }

  /* ---------------- Mulai ---------------- */
  document.addEventListener('DOMContentLoaded', () => {
    $$('[data-money]').forEach(maskInput); // pasang masker lebih dulu agar urutan listener benar
    initTheme();
    initTabs();
    initNetwork();
    initCalculator();
    initLoan();
    initDiscount();
    initSplit();
    initConverter();
    initPWA();
  });
})();
