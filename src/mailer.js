// Correos de cita confirmada: uno al consultorio y otro al paciente.
// Se envían solo cuando el pago ya fue aprobado y la cita quedó guardada.
//
// Variables de entorno (pon tus claves en Railway → Variables):
//   SMTP_HOST      p. ej. smtp.gmail.com
//   SMTP_PORT      465 (SSL) o 587 (STARTTLS). Por defecto 465
//   SMTP_SECURE    true/false. Por defecto: true si el puerto es 465
//   SMTP_USER      usuario / correo de la cuenta
//   SMTP_PASS      contraseña o "contraseña de aplicación"
//   MAIL_FROM      remitente, p. ej. "Consultorio Valeria Méndez <tucorreo@gmail.com>". Por defecto SMTP_USER
//   NOTIFY_TO      a quién avisar de cada cita (puedes poner varios separados por coma).
//                  Por defecto nutricionslim.dm@gmail.com
//   RESEND_API_KEY opcional: si existe, se usa la API de Resend (HTTPS) en lugar de SMTP.
//                  Útil en Railway Hobby, donde los puertos SMTP están bloqueados.
const nodemailer = require('nodemailer');
const { info, modalidades } = require('./info');
const schedule = require('./schedule');
const { buildIcs } = require('./ics');

const DEFAULT_NOTIFY = 'nutricionslim.dm@gmail.com';

function cfg() {
  const port = Number(process.env.SMTP_PORT || 465);
  const secureEnv = String(process.env.SMTP_SECURE || '').toLowerCase();
  return {
    host: process.env.SMTP_HOST || '',
    port,
    secure: secureEnv ? secureEnv === 'true' : port === 465,
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || (process.env.SMTP_USER ? `"Consultorio ${info.nombre}" <${process.env.SMTP_USER}>` : ''),
    notifyTo: (process.env.NOTIFY_TO || DEFAULT_NOTIFY).split(',').map(s => s.trim()).filter(Boolean),
    resendKey: process.env.RESEND_API_KEY || ''
  };
}

function mode() {
  const c = cfg();
  if (c.resendKey && c.from) return 'resend';
  if (c.host && c.user && c.pass) return 'smtp';
  return null;
}

let transporter = null, transporterKey = '';
function smtp() {
  const c = cfg();
  const key = `${c.host}:${c.port}:${c.secure}:${c.user}`;
  if (!transporter || key !== transporterKey) {
    transporter = nodemailer.createTransport({
      host: c.host, port: c.port, secure: c.secure,
      auth: { user: c.user, pass: c.pass },
      connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000
    });
    transporterKey = key;
  }
  return transporter;
}

async function send(msg) {
  const c = cfg();
  const m = mode();
  if (!m) throw new Error('Correo sin configurar (faltan SMTP_HOST, SMTP_USER o SMTP_PASS)');
  if (m === 'resend') {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${c.resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: c.from, to: [].concat(msg.to), reply_to: msg.replyTo, subject: msg.subject, html: msg.html, text: msg.text,
        attachments: (msg.attachments || []).map(a => ({ filename: a.filename, content: Buffer.from(a.content).toString('base64') }))
      })
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return (await r.json()).id;
  }
  const info_ = await smtp().sendMail({ from: c.from, ...msg });
  return info_.messageId;
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
  const out = {};
  for (const [who, job] of Object.entries(jobs)) {
    try { await job; out[who] = 'enviado'; }
    catch (e) { out[who] = 'error'; console.error(`[correo] Falló el aviso al ${who} (${c.folio}): ${e.message}`); }
  }
  console.log(`[correo] Cita ${c.folio}: consultorio=${out.consultorio}, paciente=${out.paciente} (vía ${m})`);
  return out;
}

// Para /admin/test-email: verifica la conexión y manda un correo de prueba.
async function sendTest() {
  const m = mode();
  if (!m) return { ok: false, error: 'Faltan variables: SMTP_HOST, SMTP_USER y SMTP_PASS (o RESEND_API_KEY y MAIL_FROM).' };
  const { notifyTo } = cfg();
  try {
    if (m === 'smtp') await smtp().verify();
    const id = await send({
      to: notifyTo, subject: 'Prueba de correo de la web del consultorio',
      html: layout('Correo funcionando', 'Si lees esto, los avisos de citas llegarán a este correo.', [['Enviado por', esc(m.toUpperCase())], ['Destino', esc(notifyTo.join(', '))]]),
      text: 'Si lees esto, los avisos de citas llegarán a este correo.'
    });
    return { ok: true, via: m, to: notifyTo, id };
  } catch (e) {
    return { ok: false, via: m, error: e.message };
  }
}

module.exports = { sendBookingEmails, sendTest, mode, clinicEmail, patientEmail };
