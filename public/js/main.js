// Animaciones de la página, navegación y pequeñas interacciones.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // --- Título del hero: palabra por palabra
  const title = $('[data-split]');
  if (title && !reduce) {
    const words = title.textContent.trim().split(/\s+/);
    title.setAttribute('aria-label', title.textContent.trim());
    title.innerHTML = words.map((w, i) => `<span class="w" aria-hidden="true"><span style="--i:${i}">${w}</span></span>`).join(' ');
  }
  const ready = () => requestAnimationFrame(() => document.body.classList.add('is-ready'));
  const heroImg = $('.leaf__img');
  if (heroImg && !heroImg.complete) { heroImg.addEventListener('load', ready, { once: true }); setTimeout(ready, 1200); } else ready();

  // --- Navegación: sólida al bajar, se esconde al bajar rápido, aparece al subir
  const nav = $('#nav');
  const bar = $('.progress span');
  let lastY = scrollY, ticking = false;
  function onScroll() {
    const y = scrollY;
    nav.classList.toggle('is-solid', y > 12);
    const menuOpen = document.body.classList.contains('menu-open');
    if (!menuOpen) nav.classList.toggle('is-hidden', y > 480 && y > lastY + 4);
    if (y < lastY - 4) nav.classList.remove('is-hidden');
    lastY = y;
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.setProperty('--p', max > 0 ? (y / max).toFixed(4) : 0);
    parallax(y);
    ticking = false;
  }
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });

  // --- Parallax del hero (scroll + puntero)
  const visual = $('.hero__visual');
  const layers = visual ? $$('[data-depth]', visual) : [];
  let px = 0, py = 0, sy = 0;
  function applyLayers() {
    for (const el of layers) {
      const d = Number(el.dataset.depth);
      el.style.translate = `${(px * d * 10).toFixed(1)}px ${(py * d * 10 - sy * d * 0.06).toFixed(1)}px`;
    }
  }
  function parallax(y) { if (reduce || !visual || y > innerHeight * 1.2) return; sy = y; applyLayers(); }
  if (visual && !reduce && matchMedia('(pointer: fine)').matches) {
    $('.hero').addEventListener('pointermove', e => {
      px = (e.clientX / innerWidth - .5) * 2; py = (e.clientY / innerHeight - .5) * 2;
      requestAnimationFrame(applyLayers);
    });
  }

  // --- Menú móvil
  const toggle = $('.nav__toggle'), menu = $('#menu');
  function setMenu(open) {
    toggle.setAttribute('aria-expanded', open);
    toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    toggle.querySelector('use').setAttribute('href', open ? '#i-x' : '#i-menu');
    menu.hidden = !open; menu.classList.toggle('is-open', open);
    document.body.classList.toggle('menu-open', open);
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) { nav.classList.add('is-solid'); nav.classList.remove('is-hidden'); menu.querySelector('a').focus(); }
  }
  toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  menu.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { setMenu(false); toggle.focus(); } });

  // --- Aparición al hacer scroll
  const io = new IntersectionObserver(entries => {
    for (const en of entries) if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
  $$('[data-reveal]').forEach((el, i, all) => {
    const sib = el.parentElement ? [...el.parentElement.children].filter(c => c.hasAttribute('data-reveal')) : [];
    el.style.setProperty('--d', `${Math.max(0, sib.indexOf(el)) * 90}ms`);
    io.observe(el);
  });

  // --- Precios que cuentan hacia arriba
  const counters = new IntersectionObserver(entries => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      counters.unobserve(en.target);
      const el = en.target, to = Number(el.dataset.count);
      if (reduce) continue;
      const t0 = performance.now(), dur = 1100;
      const step = t => {
        const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 4);
        el.textContent = Math.round(to * e);
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }, { threshold: .6 });
  $$('[data-count]').forEach(el => counters.observe(el));

  // --- Link activo en el menú
  const links = $$('.nav__links a');
  const spy = new IntersectionObserver(entries => {
    for (const en of entries) if (en.isIntersecting) {
      links.forEach(a => a.classList.toggle('is-current', a.getAttribute('href') === '#' + en.target.id));
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  ['consultas', 'sobre-mi', 'modalidades', 'ubicacion', 'preguntas', 'agenda', 'inicio'].forEach(id => { const s = document.getElementById(id); if (s) spy.observe(s); });

  // --- Botón magnético en el hero
  if (!reduce && matchMedia('(pointer: fine)').matches) {
    $$('.magnetic').forEach(btn => {
      btn.addEventListener('pointermove', e => {
        const r = btn.getBoundingClientRect();
        btn.style.translate = `${((e.clientX - r.left) / r.width - .5) * 10}px ${((e.clientY - r.top) / r.height - .5) * 8}px`;
      });
      btn.addEventListener('pointerleave', () => { btn.style.translate = ''; });
      btn.style.transition += ', translate .3s cubic-bezier(.22,1,.36,1)';
    });
  }

  // --- Selector en línea / presencial
  const seg = $('.seg');
  if (seg) {
    const tabs = $$('[role="tab"]', seg);
    const select = (i, focus) => {
      tabs.forEach((t, j) => {
        const on = i === j;
        t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        panel.hidden = !on;
        if (on) { panel.classList.remove('is-entering'); void panel.offsetWidth; panel.classList.add('is-entering'); }
      });
      seg.dataset.active = i;
      if (focus) tabs[i].focus();
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(i));
      t.addEventListener('keydown', e => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); select((i + 1) % tabs.length, true); }
      });
    });
  }

  // --- Preguntas frecuentes con cierre animado
  $$('.faq__list details').forEach(d => {
    const s = d.querySelector('summary');
    s.addEventListener('click', e => {
      if (!d.open || reduce) return;
      e.preventDefault();
      d.classList.add('is-closing');
      setTimeout(() => { d.open = false; d.classList.remove('is-closing'); }, 220);
    });
  });

  // --- Horario: hoy resaltado y abierto/cerrado en vivo (hora de Guadalajara)
  function mxNow() {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date()).map(x => [x.type, x.value]));
    return { wd: { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday], mins: Number(p.hour) * 60 + Number(p.minute) };
  }
  const BLOCKS = { 0: [], 1: [[9, 14], [16, 20]], 2: [[9, 14], [16, 20]], 3: [[9, 14], [16, 20]], 4: [[9, 14], [16, 20]], 5: [[9, 14], [16, 20]], 6: [[9, 14]] };
  const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const fmt = h => `${((h + 11) % 12) + 1}:00 ${h < 12 ? 'a. m.' : 'p. m.'}`;
  function updateStatus() {
    const { wd, mins } = mxNow();
    $$('.hours tr').forEach(tr => tr.classList.toggle('is-today', tr.dataset.days.split(',').map(Number).includes(wd)));
    const el = $('[data-status]'), txt = $('[data-status-text]');
    if (!el) return;
    const cur = BLOCKS[wd].find(([s, e]) => mins >= s * 60 && mins < e * 60);
    if (cur) { el.classList.add('is-open'); txt.textContent = `Abierto ahora, cierra a las ${fmt(cur[1])}`; return; }
    el.classList.remove('is-open');
    const later = BLOCKS[wd].find(([s]) => mins < s * 60);
    if (later) { txt.textContent = `Cerrado ahora. Abre hoy a las ${fmt(later[0])}`; return; }
    for (let i = 1; i <= 7; i++) {
      const d = (wd + i) % 7;
      if (BLOCKS[d].length) { txt.textContent = `Cerrado ahora. Abre ${i === 1 ? 'mañana' : 'el ' + DAYS[d]} a las ${fmt(BLOCKS[d][0][0])}`; return; }
    }
  }
  updateStatus(); setInterval(updateStatus, 60000);

  const yr = $('[data-year]'); if (yr) yr.textContent = new Date().getFullYear();
  onScroll();
})();
