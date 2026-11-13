// Correos de cita confirmada: uno al consultorio y otro al paciente.
// Se envían solo cuando el pago ya fue aprobado y la cita quedó guardada.
//
// Hay tres formas de enviar, en este orden:
//   1. Resend (API HTTPS)            si existe RESEND_API_KEY
//   2. Puente HTTPS → SMTP del ICU   si existen MAIL_PROXY_URL y MAIL_PROXY_SECRET
//      (el mismo proxy_smtp.php que usa Vida Nutritiva; sirve en Railway, donde el SMTP está bloqueado)
//   3. SMTP directo                  si existen MAIL_SERVER, MAIL_USERNAME y MAIL_PASSWORD
// En Railway (o con MAIL_FORCE_BRIDGE=true) se usa el puente sin intentar SMTP directo.
// Fuera de Railway se intenta SMTP directo y, si falla, el puente.
//
// Variables (mismos nombres que Vida Nutritiva; los SMTP_* también funcionan):
//   MAIL_PROXY_URL      URL del puente, p. ej. https://tudominio.icu/proxy_smtp.php
//   MAIL_PROXY_SECRET   secreto del puente
//   MAIL_SERVER         servidor SMTP            (o SMTP_HOST)
//   MAIL_PORT           465 o 587                (o SMTP_PORT). Por defecto 465
//   MAIL_USE_SSL        true/false               (o SMTP_SECURE). Por defecto true con 465
//   MAIL_USERNAME       usuario SMTP             (o SMTP_USER)
//   MAIL_PASSWORD       contraseña SMTP          (o SMTP_PASS)
//   MAIL_FROM           remitente visible. Por defecto "Consultorio ... <MAIL_USERNAME>"
//   NOTIFY_TO           a quién avisar (varios con coma). Por defecto nutricionslim.dm@gmail.com
//   MAIL_FORCE_BRIDGE   true para usar siempre el puente
//   RESEND_API_KEY      opcional, API de Resend
const nodemailer = require('nodemailer');
const MailComposer = require('nodemailer/lib/mail-composer');
const { info, modalidades } = require('./info');
const schedule = require('./schedule');
const { buildIcs } = require('./ics');

const DEFAULT_NOTIFY = 'nutricionslim.dm@gmail.com';
const env = (...names) => { for (const n of names) if (process.env[n]) return process.env[n].trim(); return ''; };
const truthy = v => ['1', 'true', 'yes', 'si', 'sí'].includes(String(v).toLowerCase());

function cfg() {
  const port = Number(env('MAIL_PORT', 'SMTP_PORT') || 465);
  const sslEnv = env('MAIL_USE_SSL', 'SMTP_SECURE');
  const user = env('MAIL_USERNAME', 'SMTP_USER');
  return {
    host: env('MAIL_SERVER', 'SMTP_HOST'),
    port,
    secure: sslEnv ? truthy(sslEnv) && port !== 587 : port === 465,
    user,
    pass: env('MAIL_PASSWORD', 'SMTP_PASS'),
    from: env('MAIL_FROM') || (user ? `"Consultorio ${info.nombre}" <${user}>` : ''),
    notifyTo: (env('NOTIFY_TO') || DEFAULT_NOTIFY).split(',').map(s => s.trim()).filter(Boolean),
    proxyUrl: env('MAIL_PROXY_URL'),
    proxySecret: env('MAIL_PROXY_SECRET'),
    forceBridge: truthy(env('MAIL_FORCE_BRIDGE')) || !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_ID),
    resendKey: env('RESEND_API_KEY')
  };
}

// Qué canales hay disponibles, en orden de uso
function routes() {
  const c = cfg();
  const hasBridge = !!(c.proxyUrl && c.proxySecret && c.from);
  const hasSmtp = !!(c.host && c.user && c.pass);
  if (c.resendKey && c.from) return ['resend'];
  if (hasBridge && (c.forceBridge || !hasSmtp)) return ['puente'];
  if (hasSmtp && hasBridge) return ['smtp', 'puente'];
  if (hasSmtp) return ['smtp'];
  return [];
}
function mode() { const r = routes(); return r.length ? r.join(' → ') : null; }

let transporter = null, transporterKey = '';
function smtp() {
  const c = cfg();
  const key = `${c.host}:${c.port}:${c.secure}:${c.user}`;
  if (!transporter || key !== transporterKey) {
    transporter = nodemailer.createTransport({
      host: c.host, port: c.port, secure: c.secure,
      auth: { user: c.user, pass: c.pass },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000
    });
    transporterKey = key;
  }
  return transporter;
}

const emailOnly = s => { const m = String(s).match(/<([^>]+)>/); return (m ? m[1] : String(s)).trim(); };

// Arma el mensaje completo (encabezados, HTML, texto y adjuntos) para mandarlo crudo por el puente
function buildRaw(msg) {
  return new Promise((resolve, reject) => {
    new MailComposer({ ...msg, textEncoding: 'base64' }).compile().build((err, buf) => {
      if (err) return reject(err);
      // El puente manda el mensaje tal cual por SMTP: hay que duplicar los puntos al inicio de línea
      resolve(buf.toString('utf8').replace(/\r?\n/g, '\r\n').replace(/(^|\r\n)\./g, '$1..'));
    });
  });
}

async function viaBridge(msg) {
  const c = cfg();
  const to = [].concat(msg.to).map(emailOnly);
  const raw = await buildRaw(msg);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(c.proxyUrl, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'ConsultorioValeria-Mailer/1.0' },
      // Sin "html" ni "plain": así el puente respeta nuestro remitente, Reply-To y el adjunto .ics
      body: JSON.stringify({
        secret: c.proxySecret,
        smtp_host: c.host || undefined, smtp_port: c.host ? c.port : undefined,
        smtp_user: c.user || undefined, smtp_pass: c.pass || undefined,
        from: emailOnly(msg.from), to, subject: msg.subject, raw_email: raw
      })
    });
    const text = await r.text();
    let data = {}; try { data = JSON.parse(text); } catch { }
    if (!r.ok || data.status !== 'success') throw new Error(`Puente ${r.status}: ${data.message || data.smtp_error || text.slice(0, 160)}`);
    if (data.method && data.method !== 'smtp_socket_authenticated') console.warn(`[correo] El puente usó ${data.method}: ${data.warning || ''}`);
    return data.method || 'puente';
  } finally { clearTimeout(timer); }
}

async function viaResend(msg) {
  const c = cfg();
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: msg.from, to: [].concat(msg.to), reply_to: msg.replyTo, subject: msg.subject, html: msg.html, text: msg.text,
      attachments: (msg.attachments || []).map(a => ({ filename: a.filename, content: Buffer.from(a.content).toString('base64') }))
    })
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return 'resend';
}

async function send(msg) {
  const c = cfg();
  const list = routes();
  if (!list.length) throw new Error('Correo sin configurar');
  const full = { from: c.from, ...msg };
  let lastErr;
  for (const via of list) {
    try {
      if (via === 'resend') return await viaResend(full);
      if (via === 'puente') return await viaBridge(full);
      await smtp().sendMail(full); return 'smtp';
    } catch (e) {
      lastErr = e;
      if (list.length > 1) console.warn(`[correo] Falló ${via} (${e.message}); probando el siguiente canal`);
    }
  }
  throw lastErr;
}

// ---------- Plantillas ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const money = n => `$${Number(n).toLocaleString('es-MX')} MXN`;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const brandName = b => ({ visa: 'Visa', mastercard: 'Mastercard', amex: 'Amex' }[b] || 'Tarjeta');

function details(c) {
  return {
    cuando: `${cap(schedule.humanDate(c.fecha))}, ${schedule.humanTime(c.hora)}`,
    modalidad: modalidades[c.modalidad]?.nombre || c.modalidad,
    pago: `${money(c.monto)}, ${brandName(c.pago.brand)} terminación ${c.pago.last4}${c.pago.test ? ' (modo prueba)' : ''}`,
    lugar: c.modalidad === 'presencial' ? info.direccion : 'En línea, por videollamada. Te mandan el enlace por WhatsApp.',
    wa: `https://wa.me/${info.whatsapp}?text=${encodeURIComponent(`Hola, tengo una cita con folio ${c.folio}.`)}`,
    mapa: `https://www.google.com/maps/dir/?api=1&destination=${info.coords.lat},${info.coords.lng}`
  };
}

function layout(title, intro, rows, after = '') {
  const tr = rows.map(([k, v]) => `<tr><td style="padding:10px 0;border-bottom:1px solid #D5E0D8;color:#5E6B78;font-size:14px;vertical-align:top;width:38%">${esc(k)}</td><td style="padding:10px 0;border-bottom:1px solid #D5E0D8;color:#0F172A;font-size:15px;font-weight:600">${v}</td></tr>`).join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#F5F7F2;font-family:Arial,Helvetica,sans-serif;color:#0F172A">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7F2;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #D5E0D8">
<tr><td style="background:#0B3B3A;padding:22px 28px;color:#FFFFFF">
  <div style="font-size:13px;opacity:.8">${esc(info.nombre)}</div>
  <div style="font-size:22px;font-weight:bold;margin-top:4px">${esc(title)}</div>
</td></tr>
<tr><td style="padding:24px 28px">
  <p style="margin:0 0 16px;font-size:16px;line-height:1.55">${intro}</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${tr}</table>
  ${after}
</td></tr>
<tr><td style="padding:16px 28px 22px;color:#5E6B78;font-size:12px;line-height:1.5;border-top:1px solid #E7EFE9">
  ${esc(info.direccionCorta)}<br>WhatsApp ${esc(info.telefono)}
</td></tr>
</table></td></tr></table></body></html>`;
}

const button = (href, label) => `<a href="${esc(href)}" style="display:inline-block;background:#15803D;color:#FFFFFF;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:10px;margin:18px 8px 0 0">${esc(label)}</a>`;

function clinicEmail(c) {
  const d = details(c);
  const p = c.paciente;
  const rows = [
    ['Folio', esc(c.folio)],
    ['Consulta', esc(c.servicioNombre)],
    ['Cuándo', esc(d.cuando)],
    ['Modalidad', esc(d.modalidad)],
    ['Paciente', esc(p.name)],
    ['WhatsApp', `<a href="https://wa.me/${esc(p.phone.replace(/\D/g, '').replace(/^(\d{10})$/, '52$1'))}" style="color:#15803D">${esc(p.phone)}</a>`],
    ['Correo', `<a href="mailto:${esc(p.email)}" style="color:#15803D">${esc(p.email)}</a>`],
    ['Motivo', esc(p.notes || 'Sin motivo escrito')],
    ['Pago aprobado', esc(d.pago)]
  ];
  return {
    subject: `Nueva cita ${c.folio}: ${p.name}, ${d.cuando}`,
    replyTo: p.email,
    html: layout('Nueva cita confirmada', `Se agendó y pagó una cita desde la web.`, rows),
    text: [`Nueva cita confirmada (${c.folio})`, `Consulta: ${c.servicioNombre}`, `Cuándo: ${d.cuando}`, `Modalidad: ${d.modalidad}`,
      `Paciente: ${p.name}`, `WhatsApp: ${p.phone}`, `Correo: ${p.email}`, `Motivo: ${p.notes || 'Sin motivo escrito'}`, `Pago aprobado: ${d.pago}`].join('\n')
  };
}

function patientEmail(c, replyTo) {
  const d = details(c);
  const p = c.paciente;
  const first = p.name.split(/\s+/)[0];
  const rows = [
    ['Folio', esc(c.folio)],
    ['Consulta', esc(c.servicioNombre)],
    ['Cuándo', esc(d.cuando)],
    ['Modalidad', esc(d.modalidad)],
    ['Dónde', esc(d.lugar)],
    ['Pagado', esc(d.pago)]
  ];
  const extra = c.servicio === 'renal'
    ? '<p style="margin:18px 0 0;font-size:14px;line-height:1.55;color:#3B4A5A">Si los tienes, ten a la mano tus estudios recientes: química sanguínea, electrolitos séricos y examen general de orina.</p>'
    : '';
  const after = `<p style="margin:18px 0 0;font-size:14px;line-height:1.55;color:#3B4A5A">Te escribirán por WhatsApp para confirmar los detalles. Va adjunto un archivo para agregar la cita a tu calendario.</p>${extra}
  ${button(d.wa, 'Escribir por WhatsApp')}${c.modalidad === 'presencial' ? button(d.mapa, 'Cómo llegar') : ''}
  <p style="margin:18px 0 0;font-size:13px;color:#5E6B78">Para cambiar o cancelar tu cita, escribe por WhatsApp con tu folio.</p>`;
  return {
    to: p.email,
    replyTo,
    subject: `Tu cita está confirmada: ${d.cuando} (folio ${c.folio})`,
    html: layout('Tu cita está confirmada', `Hola, ${esc(first)}. Tu pago fue aprobado y tu cita quedó agendada.`, rows, after),
    text: [`Hola, ${first}. Tu cita está confirmada.`, `Folio: ${c.folio}`, `Consulta: ${c.servicioNombre}`, `Cuándo: ${d.cuando}`,
      `Modalidad: ${d.modalidad}`, `Dónde: ${d.lugar}`, `Pagado: ${d.pago}`, '', `Dudas o cambios por WhatsApp: ${info.telefono} (${d.wa})`].join('\n'),
    attachments: [{ filename: `cita-${c.folio}.ics`, content: buildIcs(c), contentType: 'text/calendar; charset=utf-8; method=PUBLISH' }]
  };
}

// Envía los dos correos. Nunca lanza error: devuelve el estado de cada uno.
async function sendBookingEmails(c) {
  const m = mode();
  if (!m) {
    console.warn(`[correo] Sin configurar: no se enviaron avisos de la cita ${c.folio}.`);
    return { consultorio: 'sin_configurar', paciente: 'sin_configurar' };
  }
  const { notifyTo } = cfg();
  const jobs = {
    consultorio: send({ to: notifyTo, ...clinicEmail(c) }),
    paciente: send(patientEmail(c, notifyTo[0]))
  };
  const out = {}, vias = [];
  for (const [who, job] of Object.entries(jobs)) {
    try { vias.push(await job); out[who] = 'enviado'; }
    catch (e) { out[who] = 'error'; console.error(`[correo] Falló el aviso al ${who} (${c.folio}): ${e.message}`); }
  }
  console.log(`[correo] Cita ${c.folio}: consultorio=${out.consultorio}, paciente=${out.paciente} (${vias.join(', ') || m})`);
  return out;
}

// Para /admin/test-email: verifica la conexión y manda un correo de prueba.
async function sendTest() {
  const m = mode();
  if (!m) return { ok: false, error: 'Faltan variables: MAIL_PROXY_URL + MAIL_PROXY_SECRET + MAIL_USERNAME (puente), o MAIL_SERVER + MAIL_USERNAME + MAIL_PASSWORD (SMTP).' };
  const { notifyTo } = cfg();
  try {
    const via = await send({
      to: notifyTo, subject: 'Prueba de correo de la web del consultorio',
      html: layout('Correo funcionando', 'Si lees esto, los avisos de citas llegarán a este correo.', [['Canales', esc(m)], ['Destino', esc(notifyTo.join(', '))]]),
      text: 'Si lees esto, los avisos de citas llegarán a este correo.'
    });
    return { ok: true, via, to: notifyTo };
  } catch (e) {
    return { ok: false, canales: m, error: e.message };
  }
}

module.exports = { sendBookingEmails, sendTest, mode, routes, buildRaw, clinicEmail, patientEmail };
