// Agenda en línea: consulta → día → hora → datos → pago (modo prueba) → confirmación
(() => {
  const root = document.getElementById('booking');
  if (!root) return;
  const $ = (s, el = root) => el.querySelector(s);
  const $$ = (s, el = root) => [...el.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const PRICES = { general: 500, renal: 800 };
  const NAMES = { general: 'Nutrición general', renal: 'Nutrición renal' };
  const MODES = { online: 'En línea', presencial: 'Presencial' };
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

  const state = { step: 1, service: null, modality: null, date: null, time: null, patient: null, month: null, today: null, maxDate: null };

  const money = n => `$${n.toLocaleString('es-MX')}`;
  const dateLabel = ds => { const [y, m, d] = ds.split('-').map(Number); return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} de ${MONTHS[m - 1]}`; };
  const timeLabel = t => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`; };
  const addDays = (ds, n) => { const [y, m, d] = ds.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

  // ---------- Resumen ----------
  function setSum(key, value) {
    const dd = $(`[data-sum="${key}"]`);
    const empty = value == null;
    const txt = empty ? 'Sin elegir' : value;
    dd.classList.toggle('is-empty', empty);
    if (dd.textContent !== txt) { dd.textContent = txt; dd.classList.remove('flash'); void dd.offsetWidth; if (!empty) dd.classList.add('flash'); }
  }
  function renderSummary() {
    setSum('service', state.service ? NAMES[state.service] : null);
    setSum('modality', state.modality ? MODES[state.modality] : null);
    setSum('date', state.date ? dateLabel(state.date) : null);
    setSum('time', state.time ? timeLabel(state.time) : null);
    const t = $('[data-sum="total"]');
    const val = state.service ? `${money(PRICES[state.service])} MXN` : '$0';
    if (t.textContent !== val) { t.textContent = val; t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash'); }
    $('[data-pay-label]').textContent = state.service ? `Pagar ${money(PRICES[state.service])} MXN` : 'Pagar';
  }

  // ---------- Pasos ----------
  function go(step, { focus = true } = {}) {
    const prev = state.step;
    state.step = step;
    $$('.step').forEach(s => {
      const on = s.dataset.step === String(step);
      s.classList.toggle('is-active', on);
      s.classList.toggle('is-back', on && typeof prev === 'number' && typeof step === 'number' && step < prev);
    });
    const n = step === 'done' ? 6 : step;
    $$('[data-step-dot]').forEach(li => {
      const k = Number(li.dataset.stepDot);
      li.classList.toggle('is-active', k === n);
      li.classList.toggle('is-done', k < n);
      if (k === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    if (focus) {
      const target = step === 'done' ? $('[data-step="done"]') : $(`[data-step="${step}"] h3`);
      if (target) { target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); }
      const top = root.getBoundingClientRect().top;
      if (top < 0 || top > innerHeight * .5) root.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }
  }

  root.addEventListener('click', e => {
    if (e.target.closest('[data-prev]')) {
      const map = { 2: 1, 3: 2, 4: 3, 5: 4 };
      go(map[state.step] || 1);
    }
  });

  // ---------- Paso 1 ----------
  $$('input[name="service"], input[name="modality"]').forEach(inp => inp.addEventListener('change', () => {
    state[inp.name] = inp.value; renderSummary(); $('[data-error="step1"]').textContent = '';
  }));
  $('[data-step="1"] [data-next]').addEventListener('click', () => {
    if (!state.service || !state.modality) {
      $('[data-error="step1"]').textContent = !state.service ? 'Elige el tipo de consulta para continuar.' : 'Elige si prefieres en línea o presencial.';
      return;
    }
    go(2); loadMonth(state.month || state.today.slice(0, 7));
  });

  // ---------- Paso 2: calendario ----------
  const grid = $('.cal__grid');
  async function loadMonth(month) {
    state.month = month;
    const [y, m] = month.split('-').map(Number);
    $('.cal__title').textContent = `${MONTHS[m - 1]} ${y}`;
    $('[data-cal-prev]').disabled = month <= state.today.slice(0, 7);
    $('[data-cal-next]').disabled = month >= state.maxDate.slice(0, 7);
    grid.classList.add('is-loading');
    let days = {};
    try {
      const r = await fetch(`/api/availability?month=${month}`);
      days = (await r.json()).days || {};
    } catch { grid.innerHTML = '<p class="empty">No se pudo cargar el calendario. Revisa tu conexión e intenta de nuevo.</p>'; grid.classList.remove('is-loading'); return; }
    if (state.month !== month) return;
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const offset = (first + 6) % 7; // lunes primero
    const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
    let html = '';
    for (let i = 0; i < offset; i++) html += '<span></span>';
    for (let d = 1; d <= total; d++) {
      const ds = `${month}-${String(d).padStart(2, '0')}`;
      const free = days[ds] || 0;
      const cls = ['cal__day', free ? 'has-slots' : '', ds === state.today ? 'is-today' : '', ds === state.date ? 'is-selected' : ''].join(' ');
      const label = `${dateLabel(ds)}${free ? `, ${free} horario${free > 1 ? 's' : ''} libre${free > 1 ? 's' : ''}` : ', sin horarios'}`;
      html += `<button type="button" class="${cls}" data-date="${ds}" style="--i:${d}" ${free ? '' : 'disabled'} aria-label="${label}" ${ds === state.date ? 'aria-pressed="true"' : ''}>${d}</button>`;
    }
    grid.innerHTML = html;
    grid.classList.remove('is-loading');
  }
  $('[data-cal-prev]').addEventListener('click', () => { const [y, m] = state.month.split('-').map(Number); loadMonth(new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7)); });
  $('[data-cal-next]').addEventListener('click', () => { const [y, m] = state.month.split('-').map(Number); loadMonth(new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7)); });
  grid.addEventListener('click', e => {
    const b = e.target.closest('[data-date]'); if (!b || b.disabled) return;
    state.date = b.dataset.date; state.time = null;
    $$('.cal__day', grid).forEach(x => { x.classList.toggle('is-selected', x === b); x.toggleAttribute('aria-pressed', x === b); });
    renderSummary();
    setTimeout(() => { go(3); loadSlots(); }, reduce ? 0 : 160);
  });
  // flechas del teclado dentro del calendario
  grid.addEventListener('keydown', e => {
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!delta) return;
    const btns = $$('.cal__day', grid);
    const i = btns.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    for (let j = i + delta; j >= 0 && j < btns.length; j += delta) { if (!btns[j].disabled) { btns[j].focus(); break; } }
  });

  // ---------- Paso 3: horas ----------
  const slotsEl = $('#slots');
  async function loadSlots() {
    $('[data-slots-label]').textContent = dateLabel(state.date).replace(/^./, c => c.toUpperCase());
    slotsEl.innerHTML = '<p class="step__lead">Buscando horarios…</p>';
    let slots = [];
    try { slots = (await (await fetch(`/api/slots?date=${state.date}`)).json()).slots || []; } catch { }
    if (!slots.length) {
      slotsEl.innerHTML = '<div class="empty">Este día ya no tiene horarios libres. <br><button class="btn btn--ghost btn--sm" type="button" data-prev>Elegir otro día</button></div>';
      return;
    }
    const groups = [['Mañana', slots.filter(t => t < '14:00')], ['Tarde', slots.filter(t => t >= '14:00')]].filter(g => g[1].length);
    let i = 0;
    slotsEl.innerHTML = groups.map(([name, list]) => `<div class="slots__group"><h4>${name}</h4><div class="slots__row">${list.map(t => `<button type="button" class="slot" data-time="${t}" style="--i:${i++}" aria-pressed="${t === state.time}">${timeLabel(t)}</button>`).join('')}</div></div>`).join('');
  }
  slotsEl.addEventListener('click', e => {
    const b = e.target.closest('[data-time]'); if (!b) return;
    state.time = b.dataset.time;
    $$('.slot', slotsEl).forEach(x => x.setAttribute('aria-pressed', x === b));
    renderSummary();
    setTimeout(() => go(4), reduce ? 0 : 160);
  });

  // ---------- Validación (al salir del campo; el error se borra al corregir) ----------
  function fieldOf(input) { return input.closest('.field'); }
  function setError(form, key, msg) {
    const p = form.querySelector(`[data-for="${key}"]`); if (!p) return;
    p.textContent = msg || '';
    const f = p.closest('.field'); f.classList.toggle('is-invalid', !!msg);
    const input = f.querySelector('input, textarea');
    if (input) { input.setAttribute('aria-invalid', !!msg); if (msg) input.setAttribute('aria-describedby', p.id || (p.id = 'err-' + key)); }
  }
  function wire(form, validators, keyOf = n => n) {
    for (const [name, fn] of Object.entries(validators)) {
      const input = form.elements[name];
      input.addEventListener('blur', () => { if (input.value.trim()) setError(form, keyOf(name), fn(input.value)); });
      input.addEventListener('input', () => { if (fieldOf(input).classList.contains('is-invalid') && !fn(input.value)) setError(form, keyOf(name), ''); });
    }
    return () => {
      let firstBad = null;
      for (const [name, fn] of Object.entries(validators)) {
        const msg = fn(form.elements[name].value); setError(form, keyOf(name), msg);
        if (msg && !firstBad) firstBad = form.elements[name];
      }
      if (firstBad) firstBad.focus();
      return !firstBad;
    };
  }

  // ---------- Paso 4: datos ----------
  const pForm = $('#patient-form');
  const checkPatient = wire(pForm, {
    name: v => v.trim().length >= 3 ? '' : 'Escribe tu nombre completo.',
    email: v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? '' : 'Revisa tu correo, por ejemplo nombre@correo.com.',
    phone: v => v.replace(/\D/g, '').length >= 10 ? '' : 'Escribe un teléfono de 10 dígitos.'
  });
  pForm.addEventListener('submit', e => {
    e.preventDefault();
    if (!checkPatient()) return;
    state.patient = Object.fromEntries(new FormData(pForm));
    const cname = $('#c-name');
    if (!cname.value) { cname.value = state.patient.name.toUpperCase(); updateCard(); }
    go(5);
  });

  // ---------- Paso 5: tarjeta ----------
  const cForm = $('#pay-form');
  const card = $('.card3d');
  const luhn = num => { let s = 0, dbl = false; for (let i = num.length - 1; i >= 0; i--) { let d = +num[i]; if (dbl) { d *= 2; if (d > 9) d -= 9; } s += d; dbl = !dbl; } return s % 10 === 0; };
  const brandOf = n => /^4/.test(n) ? 'visa' : /^(5[1-5]|2[2-7])/.test(n) ? 'mastercard' : /^3[47]/.test(n) ? 'amex' : '';
  const TEST = ['4242424242424242', '5555555555554444', '378282246310005', '4000000000000002', '4000000000009995'];

  function formatNumber(v) {
    const d = v.replace(/\D/g, '').slice(0, 19);
    if (/^3[47]/.test(d)) return [d.slice(0, 4), d.slice(4, 10), d.slice(10, 15)].filter(Boolean).join(' ');
    return d.replace(/(.{4})/g, '$1 ').trim();
  }
  function updateCard() {
    const num = cForm.number.value.replace(/\D/g, '');
    const brand = brandOf(num);
    card.dataset.brand = brand;
    $('[data-card-brand]').textContent = brand === 'mastercard' ? 'Mastercard' : brand === 'amex' ? 'Amex' : brand === 'visa' ? 'Visa' : '';
    const mask = (brand === 'amex' ? '•••• •••••• •••••' : '•••• •••• •••• ••••').split('');
    let k = 0; const shown = mask.map(c => c === '•' ? (num[k++] || '•') : c).join('');
    $('[data-card-num]').textContent = shown;
    $('[data-card-name]').textContent = cForm.name.value.trim() || 'NOMBRE APELLIDO';
    $('[data-card-exp]').textContent = cForm.exp.value || 'MM/AA';
    $('[data-card-cvc]').textContent = cForm.cvc.value ? '•'.repeat(cForm.cvc.value.length) : '•••';
  }
  cForm.number.addEventListener('input', e => { const pos = e.target.value.length; e.target.value = formatNumber(e.target.value); updateCard(); });
  cForm.exp.addEventListener('input', e => {
    let d = e.target.value.replace(/\D/g, '').slice(0, 4);
    if (d.length === 1 && Number(d) > 1) d = '0' + d;
    e.target.value = d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
    updateCard();
  });
  cForm.cvc.addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); updateCard(); });
  cForm.name.addEventListener('input', updateCard);
  cForm.cvc.addEventListener('focus', () => card.classList.add('is-flipped'));
  cForm.cvc.addEventListener('blur', () => card.classList.remove('is-flipped'));

  const checkCard = wire(cForm, {
    number: v => { const n = v.replace(/\D/g, ''); if (n.length < 13 || !luhn(n)) return 'Revisa el número de la tarjeta.'; if (!TEST.includes(n)) return 'Modo prueba: usa 4242 4242 4242 4242. No se aceptan tarjetas reales.'; return ''; },
    name: v => v.trim().length >= 3 ? '' : 'Escribe el nombre como aparece en la tarjeta.',
    exp: v => {
      const m = v.match(/^(\d{2})\/(\d{2})$/); if (!m) return 'Usa el formato MM/AA.';
      const mo = +m[1], yr = 2000 + +m[2]; if (mo < 1 || mo > 12) return 'El mes debe ir de 01 a 12.';
      return new Date(yr, mo, 1) <= new Date() ? 'La tarjeta está vencida.' : '';
    },
    cvc: v => { const need = brandOf(cForm.number.value.replace(/\D/g, '')) === 'amex' ? 4 : 3; return v.length === need ? '' : `El código tiene ${need} dígitos.`; }
  }, n => n === 'name' ? 'cname' : n);

  $('[data-fill-test]').addEventListener('click', () => {
    const yy = String((new Date().getFullYear() + 3) % 100).padStart(2, '0');
    const vals = { number: '4242 4242 4242 4242', name: (state.patient?.name || 'Paciente Prueba').toUpperCase(), exp: `12/${yy}`, cvc: '123' };
    // se escribe con un pequeño efecto de tecleo
    let delay = 0;
    for (const [k, v] of Object.entries(vals)) {
      const inp = cForm.elements[k]; inp.value = '';
      if (reduce) { inp.value = v; continue; }
      [...v].forEach((ch, i) => setTimeout(() => { inp.value += ch; updateCard(); }, delay + i * 18));
      delay += v.length * 18 + 60;
    }
    setTimeout(() => { updateCard(); ['number', 'name', 'exp', 'cvc'].forEach(k => setError(cForm, k === 'name' ? 'cname' : k, '')); $('[data-pay-error]').textContent = ''; cForm.querySelector('.btn--pay').focus(); }, reduce ? 0 : delay + 20);
  });

  cForm.addEventListener('submit', async e => {
    e.preventDefault();
    $('[data-pay-error]').textContent = '';
    if (!checkCard()) return;
    const btn = cForm.querySelector('.btn--pay');
    const label = $('[data-pay-label]');
    const original = label.textContent;
    btn.classList.add('is-loading'); btn.setAttribute('aria-busy', 'true');
    btn.querySelector('.ico').outerHTML = '<span class="spinner" aria-hidden="true"></span>';
    label.textContent = 'Procesando pago…';
    try {
      const r = await fetch('/api/bookings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: state.service, modality: state.modality, date: state.date, time: state.time, patient: state.patient,
          card: { number: cForm.number.value, name: cForm.name.value, exp: cForm.exp.value, cvc: cForm.cvc.value }
        })
      });
      const data = await r.json();
      if (!r.ok) {
        if (data.code === 'slot_taken') { $('[data-pay-error]').textContent = data.error; state.time = null; renderSummary(); setTimeout(() => { go(3); loadSlots(); }, 1400); return; }
        $('[data-pay-error]').textContent = data.error || 'No se pudo completar el pago. Intenta de nuevo.';
        if (data.fields?.number) setError(cForm, 'number', data.fields.number);
        return;
      }
      showDone(data);
    } catch {
      $('[data-pay-error]').textContent = 'Sin conexión. Revisa tu internet e intenta de nuevo; no se hizo ningún cargo.';
    } finally {
      btn.classList.remove('is-loading'); btn.removeAttribute('aria-busy');
      const sp = btn.querySelector('.spinner'); if (sp) sp.outerHTML = '<svg class="ico"><use href="#i-lock"/></svg>';
      label.textContent = original;
    }
  });

  // ---------- Confirmación ----------
  function showDone(d) {
    $('[data-done-folio]').textContent = d.folio;
    $('[data-done-service]').textContent = d.servicio.replace('Consulta de ', '');
    $('[data-done-when]').textContent = `${d.fechaTexto.replace(/^./, c => c.toUpperCase())}, ${d.horaTexto}`;
    $('[data-done-mode]').textContent = d.modalidad;
    $('[data-done-paid]').textContent = `${money(d.monto)} MXN, ${d.pago.brand === 'mastercard' ? 'Mastercard' : d.pago.brand === 'amex' ? 'Amex' : 'Visa'} terminación ${d.pago.last4}`;
    $('[data-done-ics]').href = `/api/bookings/${d.folio}/ics`;
    $('[data-done-wa]').href = d.whatsapp;
    go('done');
    burst();
  }
  function burst() {
    if (reduce) return;
    const box = $('.burst'); box.innerHTML = '';
    const colors = ['#10B981', '#15803D', '#0F766E', '#6EE7B7', '#1E3A8A'];
    for (let i = 0; i < 26; i++) {
      const a = (Math.PI * 2 * i) / 26 + Math.random() * .3, dist = 120 + Math.random() * 160;
      const leaf = document.createElement('i');
      leaf.style.cssText = `--x:${Math.cos(a) * dist}px;--y:${Math.sin(a) * dist * .8 + 60}px;--r:${Math.random() * 540 - 270}deg;--c:${colors[i % colors.length]};animation-delay:${600 + Math.random() * 120}ms`;
      box.appendChild(leaf);
    }
  }
  $('[data-restart]').addEventListener('click', () => {
    Object.assign(state, { service: null, modality: null, date: null, time: null });
    $$('input[type="radio"]').forEach(r => r.checked = false);
    cForm.reset(); updateCard(); renderSummary(); go(1);
  });

  // ---------- Entradas desde fuera (tarjetas de precios, chat) ----------
  window.__book = ({ service, modality } = {}) => {
    if (state.step === 'done') $('[data-restart]').click();
    if (service) { const r = $(`input[name="service"][value="${service}"]`); r.checked = true; state.service = service; }
    if (modality) { const r = $(`input[name="modality"][value="${modality}"]`); r.checked = true; state.modality = modality; }
    renderSummary();
    if (state.step !== 1) go(1, { focus: false });
    document.getElementById('agenda').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
  };
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-book]'); if (!a) return;
    e.preventDefault(); window.__book({ service: a.dataset.book });
  });

  // ---------- Inicio ----------
  fetch('/api/config').then(r => r.json()).then(cfg => {
    state.today = cfg.hoy; state.maxDate = addDays(cfg.hoy, cfg.info.ventanaDias);
  }).catch(() => {
    const d = new Date(); state.today = d.toISOString().slice(0, 10); state.maxDate = addDays(state.today, 45);
  });
  renderSummary(); updateCard();
})();
