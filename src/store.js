// Guardado simple en un archivo JSON.
// En Railway, monta un Volume y pon DATA_DIR=/data para que las citas no se borren al redeploy.
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'citas.json');

let cache = null;
let writing = Promise.resolve();

function load() {
  if (cache) return cache;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (!Array.isArray(cache.citas)) cache = { citas: [] };
  } catch {
    cache = { citas: [] };
  }
  return cache;
}

function persist() {
  const snapshot = JSON.stringify(cache, null, 2);
  writing = writing.then(() => new Promise(resolve => {
    const tmp = FILE + '.tmp';
    fs.writeFile(tmp, snapshot, err => {
      if (err) { console.error('No se pudo guardar citas:', err.message); return resolve(); }
      fs.rename(tmp, FILE, e => { if (e) console.error(e.message); resolve(); });
    });
  }));
  return writing;
}

function takenSet() {
  return new Set(load().citas.filter(c => c.estado !== 'cancelada').map(c => `${c.fecha} ${c.hora}`));
}

function isTaken(fecha, hora) {
  return takenSet().has(`${fecha} ${hora}`);
}

function add(cita) {
  load().citas.push(cita);
  persist();
  return cita;
}

// Guarda cambios hechos a una cita ya existente (p. ej. estado de los correos)
function save() { return persist(); }

function byFolio(folio) {
  return load().citas.find(c => c.folio === folio) || null;
}

function all() {
  return [...load().citas].sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
}

module.exports = { takenSet, isTaken, add, save, byFolio, all, DATA_DIR };
