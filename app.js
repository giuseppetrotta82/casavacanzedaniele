/* Casa Vacanze Daniele - scroll scrubbing + mappa animata */
(() => {
  'use strict';
  const BASE = new URL('.', document.currentScript.src).href;
  const EN = document.documentElement.lang === 'en';
  const T = (it, en) => (EN ? en : it);

  // ---------- fotogrammi ----------
  const FRAMES = [];
  for (let i = 0; i <= 68; i++) FRAMES.push(i);
  for (let i = 96; i <= 124; i++) FRAMES.push(i);
  FRAMES.push(144);

  const set = (innerWidth / innerHeight) < 1 ? 'm' : 'd';
  // ?v=2 sull'ultimo fotogramma: ricolorato al tramonto, forza il nuovo download oltre la cache di 30 giorni
  const src = i => `${BASE}frames/${set}/${String(i).padStart(3, '0')}.webp${i === 144 ? '?v=4' : ''}`;
  // punto dell'aereo nel primo fotogramma (coordinate normalizzate)
  const PLANE = set === 'd' ? { x: 0.48, y: 0.37 } : { x: 0.45, y: 0.37 };

  const imgs = new Map();
  const order = [];
  [16, 8, 4, 2, 1].forEach(step => FRAMES.forEach((f, k) => {
    if (k % step === 0 && !order.includes(f)) order.push(f);
  }));
  order.forEach(f => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => { im._ok = true; if (f === 0 || needsRedraw(f)) requestDraw(); };
    im.src = src(f);
    imgs.set(f, im);
  });

  function nearest(f) {
    const k = FRAMES.indexOf(f);
    for (let d = 0; d < FRAMES.length; d++) {
      for (const j of [k - d, k + d]) {
        const im = imgs.get(FRAMES[j]);
        if (im && im._ok) return im;
      }
    }
    return null;
  }

  // ---------- canvas ----------
  const canvas = document.getElementById('volo-canvas');
  const ctx = canvas.getContext('2d');
  const section = document.querySelector('.volo');
  const bar = document.getElementById('volo-bar');
  const caps = [...document.querySelectorAll('.cap')];
  const topbar = document.querySelector('.topbar');

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    requestDraw();
  }

  function drawImg(im, alpha, z = 1, fx = 0.5, fy = 0.5, rot = 0) {
    if (!im) return;
    const cw = canvas.width, ch = canvas.height;
    const s = Math.max(cw / im.naturalWidth, ch / im.naturalHeight);
    const dw = im.naturalWidth * s, dh = im.naturalHeight * s;
    // 'basso': inquadra il bordo inferiore dell'immagine (visuale abbassata) senza scoprire lo sfondo
    if (fy === 'basso') fy = 1 - ch / (2 * z * dh);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cw / 2, ch / 2);
    ctx.rotate(rot);
    ctx.scale(z, z);
    ctx.drawImage(im, -fx * dw, -fy * dh, dw, dh);
    ctx.restore();
  }

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const seg = (p, a, b) => clamp((p - a) / (b - a));

  // linea temporale dello scorrimento
  // TS comprime le scene precedenti: lo spazio liberato allunga la sosta finale sulla casa
  const TS = 720 / 850;
  const S1 = [0, 0.22 * TS], S2 = [0.22 * TS, 0.48 * TS], S3 = [0.48 * TS, 0.56 * TS],
        S4 = [0.56 * TS, 0.80 * TS], S5 = [0.80 * TS, 0.90 * TS], S6 = [0.90 * TS, 1];

  let progress = 0, lastFrame = -1;
  function needsRedraw(f) { return Math.abs(f - lastFrame) < 6; }

  function render() {
    const p = progress;
    const cw = canvas.width, ch = canvas.height;
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#0f2f44';
    ctx.fillRect(0, 0, cw, ch);

    if (p < S1[1]) {
      // aereo: la camera "scende" sotto l'aereo e lo supera, poi entra nelle nuvole
      const t = seg(p, ...S1);
      const f = Math.round(lerp(0, 38, t));
      const a = t < 0.8 ? ease(t / 0.8) : 1 - ease((t - 0.8) / 0.2);
      const fx = lerp(PLANE.x, 0.5, ease(Math.min(t * 2, 1)));
      const fy = lerp(PLANE.y + 0.05, 0.66, a);
      drawImg(nearest(f), 1, 1.12 + 0.7 * a, fx, fy, (3 * Math.PI / 180) * a);
      lastFrame = f;
    } else if (p < S2[1]) {
      const f = Math.round(lerp(38, 68, seg(p, ...S2)));
      drawImg(nearest(f), 1);
      lastFrame = f;
    } else if (p < S3[1]) {
      // dissolvenza Amalfi -> Paestum (salta il passaggio confuso)
      const t = ease(seg(p, ...S3));
      drawImg(nearest(68), 1, 1 + 0.08 * t);
      drawImg(nearest(96), t, 1.08 - 0.08 * t);
      lastFrame = t < 0.5 ? 68 : 96;
    } else if (p < S4[1]) {
      const f = Math.round(lerp(96, 124, seg(p, ...S4)));
      drawImg(nearest(f), 1);
      lastFrame = f;
    } else {
      // dissolvenza Paestum -> terrazza, poi zoom lento sulla casa
      const t = ease(seg(p, ...S5));
      // visuale abbassata: più terrazza e arredi, meno facciata sopra
      // sul telefono l'immagine è già ritagliata ai lati: zoom minore
      const z0 = set === 'd' ? 1.32 : 1.16;
      const z = z0 - 0.1 * ease(seg(p, S5[0], S6[1]));
      if (t < 1) drawImg(nearest(124), 1, 1 + 0.1 * t);
      drawImg(nearest(144), t, z, 0.5, 'basso');
      lastFrame = 144;
    }

    // didascalie
    caps.forEach(c => {
      const a = +c.dataset.in * TS, b = Math.min(+c.dataset.out * TS, 1.01), fade = 0.025;
      const bEnd = c.classList.contains('cap-end') ? 1.01 : b;
      // la didascalia finale non sfuma mai in uscita (prima a fine corsa restava al 40%)
      const fadeOut = c.classList.contains('cap-end') ? 1 : (bEnd - p) / fade;
      const o = clamp(Math.min(a === 0 ? 1 : (p - a) / fade, fadeOut));
      c.style.opacity = o;
      const y = (1 - o) * 24;
      if (c.classList.contains('cap-hero')) c.style.transform = `translate(-50%, ${-(1 - o) * 30}px)`;
      else if (c.classList.contains('cap-end')) c.style.transform = `translate(-50%, ${y}px)`;
      else c.style.transform = `translateY(${y}px)`;
      c.classList.toggle('on', o > 0.5);
    });
    bar.style.width = (p * 100).toFixed(2) + '%';
  }

  let queued = false;
  function requestDraw() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; render(); });
  }

  function onScroll() {
    const r = section.getBoundingClientRect();
    const total = section.offsetHeight - innerHeight;
    progress = clamp(-r.top / total);
    topbar.classList.toggle('solid', r.bottom < 80);
    requestDraw();
    mapUpdate();
  }

  // ---------- mappa ----------
  const svg = document.getElementById('mappa-svg');
  const NS = 'http://www.w3.org/2000/svg';
  const LON0 = 14.45, LAT0 = 40.72, K = 1000, C = Math.cos(40.55 * Math.PI / 180);
  const P = (lon, lat) => [((lon - LON0) * C * K).toFixed(1), ((LAT0 - lat) * K).toFixed(1)];
  const W = +P(15.08, 0)[0], H = (LAT0 - 40.33) * K;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  const coast = [[14.45,40.615],[14.485,40.627],[14.545,40.627],[14.602,40.633],[14.63,40.64],
    [14.66,40.648],[14.70,40.648],[14.726,40.668],[14.76,40.675],[14.80,40.655],[14.835,40.632],
    [14.865,40.615],[14.90,40.588],[14.935,40.55],[14.965,40.505],[14.985,40.46],[14.995,40.42],
    [14.99,40.385],[14.985,40.35],[14.99,40.33]];
  const land = coast.map(c => P(...c).join(',')).join(' ') + ` ${W},${H} ${W},0 0,0`;

  const pts = {
    casa: P(14.8994, 40.6558), aero: P(14.9113, 40.6204), salerno: P(14.762, 40.676),
    amalfi: P(14.602, 40.634), paestum: P(15.005, 40.42)
  };
  const [cx, cy] = pts.casa.map(Number);
  const q = (a, ctrl, b) => `M${a} Q${ctrl} ${b}`;
  const routes = [
    { d: q(pts.casa, `${cx + 16},${cy + 18}`, pts.aero), cls: 'route main', from: 0.30, to: 0.48 },
    { d: q(pts.casa, `${cx - 50},${cy - 26}`, pts.salerno), cls: 'route', from: 0.45, to: 0.62 },
    { d: q(pts.salerno, `${+pts.salerno[0] - 58},${+pts.salerno[1] + 74}`, pts.amalfi), cls: 'route', from: 0.58, to: 0.78 },
    { d: q(pts.casa, `${cx + 80},${cy + 90}`, pts.paestum), cls: 'route', from: 0.62, to: 0.85 }
  ];
  const approach = `M${cx - 120},${cy + 210} Q${cx - 50},${cy + 110} ${pts.aero}`;

  const el = (tag, attrs, parent = svg, text) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (text) n.textContent = text;
    parent.appendChild(n);
    return n;
  };

  el('polygon', { points: land, class: 'land' });
  el('text', { x: W * 0.36, y: H * 0.52, class: 'sea-lbl', 'text-anchor': 'middle' }, svg, T('Golfo di Salerno', 'Gulf of Salerno'));

  const defs = el('defs', {});
  const routeEls = routes.map((r, i) => {
    const m = el('mask', { id: `m${i}`, maskUnits: 'userSpaceOnUse' }, defs);
    const mp = el('path', { d: r.d, stroke: '#fff', 'stroke-width': 8, fill: 'none', 'stroke-linecap': 'round' }, m);
    el('path', { d: r.d, class: r.cls, mask: `url(#m${i})` });
    const len = mp.getTotalLength();
    mp.style.strokeDasharray = len;
    mp.style.strokeDashoffset = len;
    return { ...r, mp, len };
  });

  const apPath = el('path', { d: approach, fill: 'none', stroke: 'none' });
  const apLen = apPath.getTotalLength();
  const plane = el('path', { d: 'M0,-9 L2,-3 L10,1 L10,3 L2,1 L1.5,6 L4,8 L4,9.5 L0,8.5 L-4,9.5 L-4,8 L-1.5,6 L-2,1 L-10,3 L-10,1 L-2,-3 Z', class: 'plane' });

  const dot = (k, r = 5) => el('circle', { cx: pts[k][0], cy: pts[k][1], r, class: 'dot' });
  ['aero', 'salerno', 'amalfi', 'paestum'].forEach(k => dot(k));
  el('circle', { cx, cy, r: 9, class: 'home-ring' });
  el('circle', { cx, cy, r: 7, class: 'home' });

  const label = (x, y, a, t1, t2) => {
    el('text', { x, y, 'text-anchor': a, class: 'lbl' }, svg, t1);
    if (t2) el('text', { x, y: y + 14, 'text-anchor': a, class: 'lbl-t' }, svg, t2);
  };
  el('text', { x: cx + 12, y: cy - 8, class: 'lbl-home' }, svg, 'Casa Daniele');
  label(+pts.aero[0] + 10, +pts.aero[1] + 4, 'start', T('Aeroporto', 'Airport'), '10 min');
  label(+pts.salerno[0], +pts.salerno[1] - 22, 'middle', 'Salerno', '20 min');
  label(+pts.amalfi[0], +pts.amalfi[1] - 26, 'middle', 'Amalfi', T('traghetto', 'ferry'));
  label(+pts.paestum[0] - 10, +pts.paestum[1] + 4, 'end', 'Paestum', '40 min');

  const mapSec = document.getElementById('posizione');
  function mapUpdate() {
    const r = mapSec.getBoundingClientRect();
    const p = clamp((innerHeight * 0.9 - r.top) / (innerHeight * 0.9));
    routeEls.forEach(rt => {
      rt.mp.style.strokeDashoffset = rt.len * (1 - seg(p, rt.from, rt.to));
    });
    const t = ease(seg(p, 0, 0.32));
    const a = apPath.getPointAtLength(apLen * t);
    const b = apPath.getPointAtLength(Math.min(apLen, apLen * t + 1));
    const ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI + 90;
    const sc = 1.4 - 0.5 * t;
    plane.setAttribute('transform', `translate(${a.x},${a.y}) rotate(${ang}) scale(${sc})`);
    plane.style.opacity = t >= 1 ? Math.max(0, 1 - (p - 0.32) * 8) : 1;
  }

  // ---------- galleria ----------
  const PHOTOS = [
    ['01-terrazza', 'La terrazza con dondolo e zona pranzo', 'The terrace with swing seat and dining area'],
    ['02-soggiorno-terrazza', 'Il soggiorno si apre sulla terrazza', 'The living room opens onto the terrace'],
    ['06-cucina', 'Cucina attrezzata con forno', 'Fully equipped kitchen with oven'],
    ['08-camera-matrimoniale', 'Camera matrimoniale', 'Double bedroom'],
    ['12-bagno-vasca', 'Bagno con vasca idromassaggio', 'Bathroom with whirlpool bath'],
    ['10-cameretta', 'Cameretta con letto estraibile', 'Second bedroom with pull-out bed'],
    ['03-soggiorno', 'Soggiorno luminoso', 'Bright living room'],
    ['07-colazione', 'Pronti per la colazione', 'Ready for breakfast'],
    ['04-divano', 'Angolo relax', 'Relaxing corner'],
    ['05-tv', 'Smart TV', 'Smart TV'],
    ['09-camera', 'Camera da letto', 'Bedroom'],
    ['11-cameretta-2', 'Cameretta', 'Second bedroom'],
    ['13-bagno-doccia', 'Bagno con doccia e lavatrice', 'Bathroom with shower and washing machine'],
    ['14-cortesia', 'Set di cortesia e asciugacapelli', 'Toiletries and hairdryer'],
    ['15-dondolo', 'Il dondolo in terrazza', 'The swing seat on the terrace'],
    ['16-vista', 'Vista dal balcone', 'View from the balcony']
  ].map(([f, it, en]) => [f, T(it, en)]);
  const SHOWN = 8;
  const grid = document.getElementById('galleria-grid');
  PHOTOS.slice(0, SHOWN).forEach(([f, cap], i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'g-item' + (i === 0 ? ' g-big' : '');
    b.setAttribute('aria-label', `${T('Apri foto', 'Open photo')}: ${cap}`);
    b.innerHTML = `<img src="${BASE}img/galleria/${f}-t.webp" alt="${cap}" loading="lazy" width="450" height="600"><span>${cap}</span>`;
    if (i === SHOWN - 1 && PHOTOS.length > SHOWN) {
      b.classList.add('g-more');
      b.insertAdjacentHTML('beforeend', `<em>+${PHOTOS.length - SHOWN} ${T('foto', 'photos')}</em>`);
    }
    b.addEventListener('click', () => openLb(i));
    grid.appendChild(b);
  });

  const lb = document.getElementById('lightbox');
  const lbImg = document.getElementById('lb-img');
  const lbCap = document.getElementById('lb-cap');
  let cur = 0;
  function showLb(i) {
    cur = (i + PHOTOS.length) % PHOTOS.length;
    const [f, cap] = PHOTOS[cur];
    lbImg.src = `${BASE}img/galleria/${f}.webp`;
    lbImg.alt = cap;
    lbCap.textContent = `${cap} · ${cur + 1}/${PHOTOS.length}`;
    const nx = new Image(); nx.src = `${BASE}img/galleria/${PHOTOS[(cur + 1) % PHOTOS.length][0]}.webp`;
  }
  function openLb(i) { showLb(i); lb.showModal(); }
  lb.querySelector('.lb-close').onclick = () => lb.close();
  lb.querySelector('.lb-prev').onclick = () => showLb(cur - 1);
  lb.querySelector('.lb-next').onclick = () => showLb(cur + 1);
  lb.addEventListener('click', e => { if (e.target === lb) lb.close(); });
  lb.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') showLb(cur - 1);
    if (e.key === 'ArrowRight') showLb(cur + 1);
  });
  let sx = null;
  lb.addEventListener('pointerdown', e => { sx = e.clientX; });
  lb.addEventListener('pointerup', e => {
    if (sx === null) return;
    const dx = e.clientX - sx; sx = null;
    if (Math.abs(dx) > 50) showLb(cur + (dx < 0 ? 1 : -1));
  });

  // ---------- modulo date -> WhatsApp ----------
  const form = document.getElementById('richiesta');
  if (form) {
    const fArr = form.arrivo, fDep = form.partenza, info = form.querySelector('.r-info');
    const pad = n => String(n).padStart(2, '0');
    const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const parse = v => { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d); };
    const fmt = d => d.toLocaleDateString(EN ? 'en-GB' : 'it-IT', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
    const nightsBetween = (a, b) => Math.round((b - a) / 86400000);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    fArr.min = iso(today);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    fDep.min = iso(tomorrow);

    function update() {
      info.classList.remove('err');
      [fArr, fDep].forEach(i => i.removeAttribute('aria-invalid'));
      if (fArr.value) {
        const next = parse(fArr.value); next.setDate(next.getDate() + 1);
        fDep.min = iso(next);
        if (fDep.value && parse(fDep.value) <= parse(fArr.value)) fDep.value = '';
      }
      if (fArr.value && fDep.value) {
        const n = nightsBetween(parse(fArr.value), parse(fDep.value));
        info.textContent = EN ? `${n} night${n > 1 ? 's' : ''}` : `${n} nott${n > 1 ? 'i' : 'e'}`;
      } else info.textContent = '';
    }
    fArr.addEventListener('change', () => { update(); if (fArr.value && !fDep.value) fDep.focus(); });
    fDep.addEventListener('change', update);

    form.addEventListener('submit', e => {
      e.preventDefault();
      const missing = [fArr, fDep].filter(i => !i.value);
      if (missing.length) {
        missing.forEach(i => i.setAttribute('aria-invalid', 'true'));
        info.classList.add('err');
        info.textContent = T('Scegli la data di arrivo e di partenza.', 'Please choose check-in and check-out dates.');
        missing[0].focus();
        return;
      }
      const a = parse(fArr.value), d = parse(fDep.value), n = nightsBetween(a, d);
      const guests = form.ospiti.value, note = form.note.value.trim();
      const lines = EN ? [
        "Hi! I'd like to check availability at Casa Vacanze Daniele:",
        `📅 Check-in: ${fmt(a)}`,
        `📅 Check-out: ${fmt(d)} (${n} night${n > 1 ? 's' : ''})`,
        `👥 Guests: ${guests}`
      ] : [
        'Ciao! Vorrei verificare la disponibilità di Casa Vacanze Daniele:',
        `📅 Arrivo: ${fmt(a)}`,
        `📅 Partenza: ${fmt(d)} (${n} nott${n > 1 ? 'i' : 'e'})`,
        `👥 Ospiti: ${guests}`
      ];
      if (note) lines.push(`📝 ${T('Note', 'Notes')}: ${note}`);
      window.open(`https://wa.me/393403619077?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener');
    });
  }

  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', () => { resize(); onScroll(); });
  resize();
  onScroll();
})();
