// Archivo de calendario (.ics) de una cita. Lo usan la descarga en la web y el correo al paciente.
const { info } = require('./info');
const schedule = require('./schedule');

function buildIcs(c) {
  const start = schedule.localToDate(c.fecha, c.hora);
  const end = new Date(start.getTime() + info.duracionCitaMin * 60000);
  const f = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const where = c.modalidad === 'presencial' ? info.direccion : 'En línea (te envían el enlace por WhatsApp)';
  const esc = s => String(s).replace(/([,;\\])/g, '\\$1');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Consultorio Valeria Mendez//Agenda//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${c.folio}@consultorionutricion.mx`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(start)}`, `DTEND:${f(end)}`,
    `SUMMARY:${esc(c.servicioNombre)} — ${esc(info.nombre)}`, `LOCATION:${esc(where)}`,
    `DESCRIPTION:Folio ${c.folio}. Dudas o cambios por WhatsApp ${info.telefono}.`,
    'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Tu consulta de nutrición es en 2 horas', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n');
}

module.exports = { buildIcs };
