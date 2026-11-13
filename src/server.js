const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { info, servicios, modalidades } = require('./info');
const schedule = require('./schedule');
const store = require('./store');
const payments = require('./payments');
const chatbot = require('./chatbot');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || '';

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '20kb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
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

  const name = String(patient.name || '').trim().slice(0, 80);
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
  } finally {
    locks.delete(key);
  }
});

// Archivo de calendario (.ics) para la cita
app.get('/api/bookings/:folio/ics', (req, res) => {
  const c = store.byFolio(String(req.params.folio).toUpperCase());
  if (!c) return res.status(404).send('Cita no encontrada');
  const start = schedule.localToDate(c.fecha, c.hora);
  const end = new Date(start.getTime() + info.duracionCitaMin * 60000);
  const f = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const where = c.modalidad === 'presencial' ? info.direccion : 'En línea (te envían el enlace por WhatsApp)';
  const esc = s => String(s).replace(/([,;\\])/g, '\\$1');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Consultorio Valeria Mendez//Agenda//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${c.folio}@consultorionutricion.mx`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(start)}`, `DTEND:${f(end)}`,
    `SUMMARY:${esc(c.servicioNombre)} — ${esc(info.nombre)}`, `LOCATION:${esc(where)}`,
    `DESCRIPTION:Folio ${c.folio}. Dudas o cambios por WhatsApp ${info.telefono}.`,
    'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Tu consulta de nutrición es en 2 horas', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n');
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
  const rows = store.all().map(c => `<tr><td>${c.folio}</td><td>${c.fecha}</td><td>${c.hora}</td><td>${c.servicio}</td><td>${c.modalidad}</td><td>${escapeHtml(c.paciente.name)}</td><td>${escapeHtml(c.paciente.phone)}</td><td>${escapeHtml(c.paciente.email)}</td><td>$${c.monto}</td><td>${c.pago.brand} •••• ${c.pago.last4}${c.pago.test ? ' (prueba)' : ''}</td></tr>`).join('');
  res.send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Citas</title><style>body{font:15px system-ui;margin:24px;color:#0F172A}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #D5E0D8;padding:8px;text-align:left;white-space:nowrap}div{overflow-x:auto}</style><h1>Citas agendadas (${store.all().length})</h1><div><table><tr><th>Folio</th><th>Fecha</th><th>Hora</th><th>Servicio</th><th>Modalidad</th><th>Paciente</th><th>Teléfono</th><th>Correo</th><th>Monto</th><th>Pago</th></tr>${rows}</table></div>`);
});

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// Página principal: la imagen para redes sociales necesita URL absoluta
const fs = require('fs');
const INDEX = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
function sendIndex(req, res) {
  const base = `${req.protocol}://${req.get('host')}`;
  res.type('html').send(INDEX.replace('content="/img/og.jpg"', `content="${base}/img/og.jpg"`).replace('</title>', `</title>\n  <link rel="canonical" href="${base}/">\n  <meta property="og:url" content="${base}/">`));
}
app.get(['/', '/index.html'], sendIndex);

app.use(express.static(path.join(__dirname, '..', 'public'), {
  extensions: ['html'],
  setHeaders(res, p) {
    if (/\.(webp|png|jpg|svg|woff2)$/.test(p)) res.setHeader('Cache-Control', 'public, max-age=604800');
  }
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use((req, res) => { res.status(404); sendIndex(req, res); });

app.listen(PORT, () => console.log(`Consultorio listo en http://localhost:${PORT}  (datos en ${store.DATA_DIR})`));
