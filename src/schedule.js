// Horarios y disponibilidad, siempre en hora de Guadalajara.
const { info } = require('./info');

const TZ = info.timezone;

// Partes de fecha/hora "de reloj" en la zona del consultorio.
function nowParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short'
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map(x => [x.type, x.value]));
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday];
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hour: Number(p.hour), minute: Number(p.minute), weekday: wd
  };
}

// Offset de la zona (en minutos) para una fecha dada. México no usa horario de verano desde 2022.
function tzOffsetMinutes(date) {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' });
  const name = fmt.formatToParts(date).find(p => p.type === 'timeZoneName').value; // GMT-06:00
  const m = name.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3] || 0));
}

// "2026-11-20" + "16:00" (hora local) -> Date en UTC
function localToDate(dateStr, timeStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);
  const guess = new Date(Date.UTC(y, mo - 1, d, h, mi));
  const off = tzOffsetMinutes(guess);
  return new Date(guess.getTime() - off * 60000);
}

function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

function blocksFor(weekday) {
  const rule = info.horario.find(r => r.days.includes(weekday));
  return rule ? rule.blocks : [];
}

function pad(n) { return String(n).padStart(2, '0'); }

// Todos los horarios de inicio de un día (sin filtrar ocupados)
function slotsForDate(dateStr) {
  const out = [];
  const step = info.duracionCitaMin;
  for (const [start, end] of blocksFor(weekdayOf(dateStr))) {
    for (let m = start * 60; m + step <= end * 60; m += step) {
      out.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
    }
  }
  return out;
}

function isValidDateStr(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
}

// Horarios libres de un día, quitando ocupados, pasados y los que no cumplen la anticipación mínima.
function freeSlots(dateStr, takenSet, now = new Date()) {
  if (!isValidDateStr(dateStr)) return [];
  const today = nowParts(now).date;
  const last = addDays(today, info.ventanaDias);
  if (dateStr < today || dateStr > last) return [];
  const minTime = now.getTime() + info.anticipacionMinHoras * 3600 * 1000;
  return slotsForDate(dateStr).filter(t =>
    !takenSet.has(`${dateStr} ${t}`) && localToDate(dateStr, t).getTime() >= minTime
  );
}

function isOpenNow(now = new Date()) {
  const p = nowParts(now);
  const mins = p.hour * 60 + p.minute;
  return blocksFor(p.weekday).some(([s, e]) => mins >= s * 60 && mins < e * 60);
}

// Siguiente momento de apertura/cierre, para el chat y la sección de mapa
function openStatus(now = new Date()) {
  const p = nowParts(now);
  const mins = p.hour * 60 + p.minute;
  const blocks = blocksFor(p.weekday);
  for (const [s, e] of blocks) {
    if (mins >= s * 60 && mins < e * 60) return { open: true, until: `${pad(e)}:00` };
  }
  for (const [s] of blocks) {
    if (mins < s * 60) return { open: false, nextDay: p.date, nextTime: `${pad(s)}:00`, today: true };
  }
  for (let i = 1; i <= 7; i++) {
    const d = addDays(p.date, i);
    const b = blocksFor(weekdayOf(d));
    if (b.length) return { open: false, nextDay: d, nextTime: `${pad(b[0][0])}:00`, today: false };
  }
  return { open: false };
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function humanDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${DIAS[weekdayOf(dateStr)]} ${d} de ${MESES[m - 1]}`;
}

function humanTime(t) {
  const [h, m] = t.split(':').map(Number);
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${pad(m)} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}

module.exports = {
  nowParts, localToDate, weekdayOf, addDays, slotsForDate, freeSlots, isValidDateStr,
  isOpenNow, openStatus, humanDate, humanTime, DIAS, MESES
};
