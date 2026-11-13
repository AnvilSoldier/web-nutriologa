// Chat del consultorio: interfaz. Las respuestas salen del algoritmo del servidor (/api/chat).
(() => {
  const chat = document.getElementById('chat');
  const fab = document.querySelector('[data-chat-toggle]');
  if (!chat || !fab) return;
  const log = chat.querySelector('.chat__log');
  const chips = chat.querySelector('.chat__chips');
  const form = chat.querySelector('.chat__form');
  const input = form.querySelector('input');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let greeted = false, busy = false;

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function open() {
    chat.hidden = false; chat.classList.remove('is-closing'); chat.classList.add('is-opening');
    fab.setAttribute('aria-expanded', 'true'); fab.setAttribute('aria-label', 'Cerrar chat');
    document.body.classList.add('chat-open');
    if (!greeted) {
      greeted = true;
      bot({ text: '¡Hola! Soy el asistente del consultorio de la L.N.C. Valeria Méndez. Respondo con la información oficial: costos, horarios, ubicación, consulta renal y cómo agendar. ¿Qué te gustaría saber?', chips: ['¿Cuánto cuesta?', '¿Dónde están?', 'Próximos horarios', '¿Qué estudios llevo a la renal?'] }, 250);
    }
    setTimeout(() => input.focus(), reduce ? 0 : 200);
  }
  function close() {
    fab.setAttribute('aria-expanded', 'false'); fab.removeAttribute('aria-label');
    document.body.classList.remove('chat-open');
    if (reduce) { chat.hidden = true; fab.focus(); return; }
    chat.classList.remove('is-opening'); chat.classList.add('is-closing');
    setTimeout(() => { chat.hidden = true; chat.classList.remove('is-closing'); }, 190);
    fab.focus();
  }
  fab.addEventListener('click', () => chat.hidden ? open() : close());
  chat.querySelector('[data-chat-close]').addEventListener('click', close);
  addEventListener('keydown', e => { if (e.key === 'Escape' && !chat.hidden) close(); });
  document.querySelectorAll('[data-open-chat]').forEach(b => b.addEventListener('click', open));

  function add(cls, html) {
    const el = document.createElement('div');
    el.className = `msg ${cls}`; el.innerHTML = html;
    log.appendChild(el);
    log.scrollTo({ top: log.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
    return el;
  }
  function setChips(list = []) {
    chips.innerHTML = list.map(c => `<button type="button">${esc(c)}</button>`).join('');
  }
  function bot(r, delay = 0) {
    const typing = add('msg--bot typing', '<i></i><i></i><i></i>');
    typing.setAttribute('aria-label', 'Escribiendo');
    const wait = reduce ? 0 : delay + Math.min(900, 280 + (r.text || '').length * 3);
    setTimeout(() => {
      typing.remove();
      let html = esc(r.text);
      if (r.actions?.length) {
        html += '<div class="msg__actions">' + r.actions.map((a, i) => {
          if (a.type === 'link') return `<a href="${esc(a.href)}" target="_blank" rel="noopener">${esc(a.label)}</a>`;
          return `<button type="button" class="${i === 0 ? 'is-main' : ''}" data-act="${esc(a.type)}" data-service="${esc(a.service || '')}" data-modality="${esc(a.modality || '')}">${esc(a.label)}</button>`;
        }).join('') + '</div>';
      }
      add('msg--bot', html);
      setChips(r.chips);
      busy = false;
    }, wait);
  }

  async function ask(text) {
    text = text.trim();
    if (!text || busy) return;
    busy = true; setChips();
    add('msg--me', esc(text));
    input.value = '';
    try {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text }) });
      const data = await r.json();
      bot(r.ok ? data : { text: data.error || 'No pude responder ahora. Intenta de nuevo en un momento.' });
    } catch {
      bot({ text: 'Sin conexión. Revisa tu internet o escribe por WhatsApp al +52 33 1628 0383.' });
    }
  }

  form.addEventListener('submit', e => { e.preventDefault(); ask(input.value); });
  chips.addEventListener('click', e => { const b = e.target.closest('button'); if (b) ask(b.textContent); });
  log.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'book') {
      if (matchMedia('(max-width: 560px)').matches) close();
      window.__book?.({ service: b.dataset.service || undefined, modality: b.dataset.modality || undefined });
    }
    if (b.dataset.act === 'map') { if (matchMedia('(max-width: 560px)').matches) close(); window.__focusMap?.(); }
  });
})();
