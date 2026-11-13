const express = require('express');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { info, servicios, modalidades } = require('./info');
const schedule = require('./schedule');
const store = require('./store');
const payments = require('./payments');
const chatbot = require('./chatbot');
const mailer = require('./mailer');
const { buildIcs } = require('./ics');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || '';
// Dominio oficial (p. ej. https://www.tudominio.mx). Con él, Google ve una sola versión del sitio:
// canonical, sitemap y datos estructurados usan este dominio y los demás (como el de Railway) redirigen aquí.
const SITE_URL = (process.env.SITE_URL || '').trim().replace(/\/+$/, '');

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(compression());
app.use(express.json({ limit: '20kb' }));

// Un solo dominio para buscadores: si SITE_URL está definido, todo lo demás redirige (301) a él
if (SITE_URL) {
  const canonicalHost = new URL(SITE_URL).host;
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path === '/health' || req.path.startsWith('/api/') || req.path.startsWith('/admin')) return next();
    if (req.get('host') === canonicalHost) return next();
    res.redirect(301, SITE_URL + req.originalUrl);
  });
}

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (req.path.startsWith('/api/') || req.path.startsWith('/admin') || req.path === '/health') res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});

// Límite simple por IP (evita abuso del chat y de la agenda)
const hits = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const key = req.ip + req.path;
    const now = Date.now();
    const h = (hits.get(key) || []).filter(t => now - t < windowMs);
    h.push(now); hits.set(key, h);
    if (h.length > max) return res.status(429).json({ error: 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.' });
    next();
  };
}
setInterval(() => hits.clear(), 10 * 60 * 1000).unref();

app.get('/health', (req, res) => res.json({ ok: true }));

app.get('/api/config', (req, res) => {
  res.json({
    info: {
      nombre: info.nombre, telefono: info.telefono, whatsapp: info.whatsapp, email: info.email,
      direccion: info.direccion, coords: info.coords, horarioTexto: info.horarioTexto,
      duracionCitaMin: info.duracionCitaMin, ventanaDias: info.ventanaDias
    },
    servicios, modalidades,
    hoy: schedule.nowParts().date,
    abierto: schedule.openStatus(),
    pagos: { modo: 'prueba', tarjetasPrueba: ['4242 4242 4242 4242', '5555 5555 5555 4444', '4000 0000 0000 0002 (rechazada)'] }
  });
});

// Días del mes con cuántos horarios libres hay
app.get('/api/availability', (req, res) => {
  const month = String(req.query.month || '');
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'Usa month=AAAA-MM' });
  const [y, m] = month.split('-').map(Number);
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const taken = store.takenSet();
  const days = {};
  for (let d = 1; d <= daysIn; d++) {
    const ds = `${month}-${String(d).padStart(2, '0')}`;
    days[ds] = schedule.freeSlots(ds, taken).length;
  }
  res.json({ month, today: schedule.nowParts().date, days });
});

app.get('/api/slots', (req, res) => {
  const date = String(req.query.date || '');
  if (!schedule.isValidDateStr(date)) return res.status(400).json({ error: 'Fecha no válida' });
  res.json({ date, label: schedule.humanDate(date), slots: schedule.freeSlots(date, store.takenSet()) });
});

function newFolio() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += alphabet[crypto.randomInt(alphabet.length)];
  return 'VM-' + s;
}

const locks = new Set();

app.post('/api/bookings', rateLimit(12, 10 * 60 * 1000), async (req, res) => {
  const { service, modality, date, time, patient = {}, card = {} } = req.body || {};
  const errors = {};
  const svc = servicios[service];
  if (!svc) errors.service = 'Elige un tipo de consulta.';
  if (!modalidades[modality]) errors.modality = 'Elige en línea o presencial.';
  if (!schedule.isValidDateStr(date)) errors.date = 'Elige una fecha.';
  if (!/^\d{2}:\d{2}$/.test(String(time || ''))) errors.time = 'Elige un horario.';

  const name = String(patient.name || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 80);
  const email = String(patient.email || '').trim().slice(0, 120);
  const phone = String(patient.phone || '').replace(/[^\d+]/g, '').slice(0, 16);
  const notes = String(patient.notes || '').trim().slice(0, 500);
  if (name.length < 3) errors.name = 'Escribe tu nombre completo.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = 'Revisa tu correo, por ejemplo nombre@correo.com.';
  if (phone.replace(/\D/g, '').length < 10) errors.phone = 'Escribe un teléfono de 10 dígitos.';
  if (Object.keys(errors).length) return res.status(400).json({ error: 'Revisa los datos marcados.', fields: errors });

  const key = `${date} ${time}`;
  if (locks.has(key) || !schedule.freeSlots(date, store.takenSet()).includes(time)) {
    return res.status(409).json({ error: 'Ese horario se acaba de ocupar. Elige otro.', code: 'slot_taken' });
  }
  locks.add(key);
  try {
    const result = await payments.charge({ amount: svc.precio, card, description: `${svc.nombre} — ${date} ${time}` });
    if (!result.ok) return res.status(402).json({ error: result.message, code: result.code, fields: result.fields });
    if (store.isTaken(date, time)) return res.status(409).json({ error: 'Ese horario se acaba de ocupar. Elige otro.', code: 'slot_taken' });

    const cita = store.add({
      folio: newFolio(), estado: 'confirmada',
      servicio: svc.id, servicioNombre: svc.nombre, modalidad: modality,
      fecha: date, hora: time, monto: svc.precio,
      paciente: { name, email, phone, notes },
      pago: { id: result.charge.id, brand: result.charge.brand, last4: result.charge.last4, authCode: result.charge.authCode, test: true },
      creada: new Date().toISOString()
    });
    res.status(201).json({
      folio: cita.folio, servicio: svc.nombre, modalidad: modalidades[modality].nombre, monto: svc.precio,
      fecha: date, hora: time, fechaTexto: schedule.humanDate(date), horaTexto: schedule.humanTime(time),
      pago: cita.pago,
      whatsapp: `https://wa.me/${info.whatsapp}?text=${encodeURIComponent(`Hola, acabo de agendar mi cita. Folio ${cita.folio}, ${schedule.humanDate(date)} a las ${schedule.humanTime(time)}.`)}`
    });

    // Pago aprobado y cita guardada: avisos por correo al consultorio y al paciente.
    // Se envían después de responder, así el paciente no espera al servidor de correo.
    mailer.sendBookingEmails(cita).then(estado => { cita.correos = estado; store.save(); });
  } finally {
    locks.delete(key);
  }
});

// Archivo de calendario (.ics) para la cita
app.get('/api/bookings/:folio/ics', (req, res) => {
  const c = store.byFolio(String(req.params.folio).toUpperCase());
  if (!c) return res.status(404).send('Cita no encontrada');
  const ics = buildIcs(c);
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="cita-${c.folio}.ics"`);
  res.send(ics);
});

app.post('/api/chat', rateLimit(40, 60 * 1000), (req, res) => {
  const msg = String(req.body?.message || '');
  res.json(chatbot.reply(msg));
});

// Panel mínimo para la nutrióloga: /admin?key=TU_CLAVE  (define ADMIN_KEY en Railway)
app.get('/admin', (req, res) => {
  if (!ADMIN_KEY || req.query.key !== ADMIN_KEY) return res.status(401).send('Define ADMIN_KEY y entra con /admin?key=TU_CLAVE');
  const rows = store.all().map(c => `<tr><td>${c.folio}</td><td>${c.fecha}</td><td>${c.hora}</td><td>${c.servicio}</td><td>${c.modalidad}</td><td>${escapeHtml(c.paciente.name)}</td><td>${escapeHtml(c.paciente.phone)}</td><td>${escapeHtml(c.paciente.email)}</td><td>$${c.monto}</td><td>${c.pago.brand} •••• ${c.pago.last4}${c.pago.test ? ' (prueba)' : ''}</td><td>${c.correos ? `Consultorio: ${c.correos.consultorio}<br>Paciente: ${c.correos.paciente}` : 'Enviando…'}</td></tr>`).join('');
  res.send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Citas</title><style>body{font:15px system-ui;margin:24px;color:#0F172A}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #D5E0D8;padding:8px;text-align:left;white-space:nowrap}div{overflow-x:auto}</style><h1>Citas agendadas (${store.all().length})</h1><div><table><tr><th>Folio</th><th>Fecha</th><th>Hora</th><th>Servicio</th><th>Modalidad</th><th>Paciente</th><th>Teléfono</th><th>Correo</th><th>Monto</th><th>Pago</th><th>Correos</th></tr>${rows}</table></div><p>Correo: ${mailer.mode() ? 'configurado (' + mailer.mode() + ')' : 'sin configurar'}. <a href="/admin/test-email?key=${encodeURIComponent(req.query.key)}">Enviar correo de prueba</a></p>`);
});

// Prueba de correo: /admin/test-email?key=TU_CLAVE
app.get('/admin/test-email', rateLimit(5, 10 * 60 * 1000), async (req, res) => {
  if (!ADMIN_KEY || req.query.key !== ADMIN_KEY) return res.status(401).send('Define ADMIN_KEY y entra con /admin/test-email?key=TU_CLAVE');
  res.json(await mailer.sendTest());
});

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---------- Página principal y SEO ----------
const PUBLIC = path.join(__dirname, '..', 'public');
const INDEX_PATH = path.join(PUBLIC, 'index.html');
const LASTMOD = fs.statSync(INDEX_PATH).mtime.toISOString().slice(0, 10);

function baseUrl(req) { return SITE_URL || `${req.protocol}://${req.get('host')}`; }

// FAQPage a partir de la sección "Preguntas frecuentes": lo que lee Google siempre coincide con lo visible
function faqJsonLd(html) {
  const strip = t => t.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const items = [...html.matchAll(/<details>\s*<summary>([\s\S]*?)<\/summary>\s*<div class="faq__a">([\s\S]*?)<\/div>\s*<\/details>/g)]
    .map(m => ({ '@type': 'Question', name: strip(m[1]), acceptedAnswer: { '@type': 'Answer', text: strip(m[2]) } }));
  if (!items.length) return '';
  const data = { '@context': 'https://schema.org', '@type': 'FAQPage', '@id': '__SITE__/#preguntas', mainEntity: items };
  return `  <script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>\n`;
}

// Versión por contenido para CSS/JS: caché larga sin servir archivos viejos después de un deploy
function assetVersion(rel) {
  try { return crypto.createHash('md5').update(fs.readFileSync(path.join(PUBLIC, rel))).digest('hex').slice(0, 8); } catch { return ''; }
}
function versionAssets(html) {
  return html.replace(/(href|src)="(\/(?:css|js)\/[\w.-]+\.(?:css|js))"/g, (m, attr, url) => {
    const v = assetVersion(url.slice(1));
    return v ? `${attr}="${url}?v=${v}"` : m;
  });
}

const INDEX_RAW = fs.readFileSync(INDEX_PATH, 'utf8');
const INDEX = versionAssets(INDEX_RAW.replace('</head>', faqJsonLd(INDEX_RAW) + '</head>')).replace(/__LASTMOD__/g, LASTMOD);

function renderIndex(req) { return INDEX.replace(/__SITE__/g, baseUrl(req)); }
function sendIndex(req, res) { res.type('html').send(renderIndex(req)); }
app.get(['/', '/index.html'], sendIndex);

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${baseUrl(req)}/sitemap.xml\n`);
});

app.get('/sitemap.xml', (req, res) => {
  const b = baseUrl(req);
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${b}/</loc>
    <lastmod>${LASTMOD}</lastmod>
    <image:image><image:loc>${b}/img/valeria-retrato.webp</image:loc></image:image>
    <image:image><image:loc>${b}/img/consultorio.webp</image:loc></image:image>
    <image:image><image:loc>${b}/img/og.jpg</image:loc></image:image>
  </url>
</urlset>
`);
});

// Resumen para buscadores con IA (ChatGPT, Perplexity, Gemini): datos oficiales en texto plano
app.get('/llms.txt', (req, res) => {
  const b = baseUrl(req);
  res.type('text/plain; charset=utf-8').send(`# ${info.nombre} — Nutrióloga en Guadalajara

> ${info.titulo}. Consulta presencial en ${info.direccionCorta} y en línea para todo México.

## Datos del consultorio
- Dirección: ${info.direccion}
- Teléfono y WhatsApp: ${info.telefono}
- Correo: ${info.email}
- Horario: ${info.horarioTexto}
- Atención presencial: ${info.coberturaPresencial}
- Atención en línea: ${info.coberturaOnline}
- Cédula profesional: ${info.cedulaLic}. Cédula de especialidad: ${info.cedulaEsp}
- Formación: ${info.licenciatura}; ${info.especialidad}

## Consultas
${Object.values(servicios).map(sv => `- ${sv.nombre}: $${sv.precio} MXN. ${sv.enfoque}`).join('\n')}

## Enlaces
- Agenda y pago en línea: ${b}/#agenda
- Preguntas frecuentes: ${b}/#preguntas
- Instagram: https://instagram.com/${info.instagram}
`);
});

app.use(express.static(PUBLIC, {
  extensions: ['html'],
  index: false,
  setHeaders(res, p) {
    if (/\.(webp|png|jpg|svg|woff2)$/.test(p)) res.setHeader('Cache-Control', 'public, max-age=2592000');
    else if (/\.(css|js)$/.test(p)) res.setHeader('Cache-Control', res.req.query.v ? 'public, max-age=31536000, immutable' : 'public, max-age=3600');
  }
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
// 404: muestra la página pero sin indexar ni marcarla como canónica
app.use((req, res) => {
  res.status(404).setHeader('X-Robots-Tag', 'noindex');
  res.type('html').send(renderIndex(req)
    .replace(/\s*<link rel="canonical"[^>]*>/, '')
    .replace(/<meta name="robots" content="[^"]*">/, '<meta name="robots" content="noindex, follow">'));
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Consultorio listo en http://localhost:${PORT}  (datos en ${store.DATA_DIR}, correo: ${mailer.mode() || 'sin configurar'})`));
}

module.exports = app;
