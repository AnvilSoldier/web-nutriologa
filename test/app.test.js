const test = require('node:test');
const assert = require('node:assert');
const chatbot = require('../src/chatbot');
const payments = require('../src/payments');
const schedule = require('../src/schedule');

test('chat responde con información oficial', () => {
  assert.equal(chatbot.reply('¿cuánto cuesta la consulta renal?').id, 'precio_renal');
  assert.match(chatbot.reply('cuanto cuesta').text, /\$500.*\$800/s);
  assert.equal(chatbot.reply('donde estan ubicados').id, 'ubicacion');
  assert.equal(chatbot.reply('que estudios llevo para la renal').id, 'estudios');
  assert.equal(chatbot.reply('trigliseridos altos').id, 'lipidos'); // error de dedo
  assert.equal(chatbot.reply('me duele el pecho').id, 'emergencia');
  assert.equal(chatbot.reply('asdf qwerty').id, 'fallback');
});

test('pagos: solo tarjetas de prueba', async () => {
  const card = { number: '4242 4242 4242 4242', name: 'Ana Prueba', exp: '12/39', cvc: '123' };
  assert.equal((await payments.charge({ amount: 500, card })).ok, true);
  assert.equal((await payments.charge({ amount: 500, card: { ...card, number: '4000 0000 0000 0002' } })).code, 'card_declined');
  assert.equal((await payments.charge({ amount: 500, card: { ...card, number: '4111 1111 1111 1111' } })).code, 'test_mode');
  assert.equal((await payments.charge({ amount: 500, card: { ...card, exp: '01/20' } })).code, 'invalid_card');
});

test('horarios del consultorio', () => {
  assert.deepEqual(schedule.slotsForDate('2026-11-16'), ['09:00', '10:00', '11:00', '12:00', '13:00', '16:00', '17:00', '18:00', '19:00']); // lunes
  assert.deepEqual(schedule.slotsForDate('2026-11-21'), ['09:00', '10:00', '11:00', '12:00', '13:00']); // sábado
  assert.deepEqual(schedule.slotsForDate('2026-11-22'), []); // domingo
  assert.equal(schedule.localToDate('2026-11-16', '09:00').toISOString(), '2026-11-16T15:00:00.000Z');
});

test('correos de cita: contenido y seguridad', () => {
  const { clinicEmail, patientEmail } = require('../src/mailer');
  const cita = {
    folio: 'VM-TEST01', servicio: 'renal', servicioNombre: 'Consulta de Nutrición Renal Especializada', modalidad: 'presencial',
    fecha: '2026-11-16', hora: '09:00', monto: 800,
    paciente: { name: 'Ana <script>x</script>', email: 'ana@correo.com', phone: '3312345678', notes: '' },
    pago: { brand: 'visa', last4: '4242', test: true }
  };
  const c = clinicEmail(cita);
  assert.equal(c.replyTo, 'ana@correo.com');
  assert.ok(!c.html.includes('<script>'));
  assert.match(c.html, /\$800 MXN, Visa terminación 4242/);
  const p = patientEmail(cita, 'nutricionslim.dm@gmail.com');
  assert.equal(p.to, 'ana@correo.com');
  assert.equal(p.replyTo, 'nutricionslim.dm@gmail.com');
  assert.match(p.subject, /VM-TEST01/);
  assert.match(p.attachments[0].content, /DTSTART:20261116T150000Z/);
});

test('correo: elige el canal según las variables', async () => {
  const { routes, buildRaw } = require('../src/mailer');
  const keep = { ...process.env };
  for (const k of Object.keys(process.env)) if (/^(MAIL_|SMTP_|RESEND_|RAILWAY_)/.test(k)) delete process.env[k];
  assert.deepEqual(routes(), []);
  Object.assign(process.env, { MAIL_SERVER: 'mail.x.mx', MAIL_USERNAME: 'bot@x.mx', MAIL_PASSWORD: 'p' });
  assert.deepEqual(routes(), ['smtp']);
  Object.assign(process.env, { MAIL_PROXY_URL: 'https://x.icu/proxy_smtp.php', MAIL_PROXY_SECRET: 's' });
  assert.deepEqual(routes(), ['smtp', 'puente']);
  process.env.RAILWAY_ENVIRONMENT = 'production';
  assert.deepEqual(routes(), ['puente']);
  const raw = await buildRaw({ from: 'a@x.mx', to: 'b@y.mx', subject: 'x', text: '.linea\nok' });
  assert.ok(!/(^|\r\n)\.[^.]/.test(raw), 'los puntos al inicio de línea van duplicados');
  process.env = keep;
});
