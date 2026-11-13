// Datos oficiales del consultorio (tomados de informacion_web_nutriologa.txt).
// Cambia aquí cualquier dato y se actualiza en la web, la agenda y el chat.

const info = {
  nombre: 'L.N.C. Valeria Méndez Ortega',
  titulo: 'Licenciada en Nutrición y Especialista en Nutrición Clínica y Renal',
  licenciatura: 'Centro Universitario de Ciencias de la Salud (CUCS), Universidad de Guadalajara',
  especialidad: 'Especialidad en Nutrición Clínica y Nefrológica, Instituto Nacional de Ciencias Médicas y Nutrición / Colegio Mexicano de Nutrición Renal',
  cedulaLic: '12485930',
  cedulaEsp: '13894021',
  certificaciones: [
    'Certificación Internacional en Antropometría ISAK Nivel 1',
    'Diplomado en Nutrición Nefrológica y Enfermedad Renal Crónica (guías KDOQI)',
    'Manejo nutricional con el Sistema Mexicano de Alimentos Equivalentes (SMAE 5ta edición)'
  ],
  direccion: 'Av. Rubén Darío #1450, Consultorio 304, Col. Providencia, C.P. 44630, Guadalajara, Jalisco, México',
  direccionCorta: 'Av. Rubén Darío 1450, consultorio 304, Providencia, Guadalajara',
  coords: { lat: 20.7026, lng: -103.38465 },
  coberturaPresencial: 'Zona Metropolitana de Guadalajara y Tonalá, Jalisco',
  coberturaOnline: 'Todo México y pacientes de habla hispana en el extranjero',
  telefono: '+52 33 1628 0383',
  whatsapp: '523316280383',
  email: 'contacto@consultorionutricion.mx',
  instagram: 'valeriamendez.nutricion',
  facebook: 'Consultorio de Nutrición Clínica y Renal - L.N.C. Valeria Méndez',
  timezone: 'America/Mexico_City',
  // Bloques de atención. day: 0=domingo … 6=sábado. Horas en formato 24 h.
  horario: [
    { days: [1, 2, 3, 4, 5], blocks: [[9, 14], [16, 20]] },
    { days: [6], blocks: [[9, 14]] }
  ],
  horarioTexto: 'Lunes a viernes de 9:00 a 14:00 y de 16:00 a 20:00. Sábados de 9:00 a 14:00. Domingo cerrado.',
  duracionCitaMin: 60,
  anticipacionMinHoras: 2,
  ventanaDias: 45
};

const servicios = {
  general: {
    id: 'general',
    nombre: 'Consulta de Nutrición General',
    precio: 500,
    enfoque: 'Control de peso, recomposición corporal, hábitos, nutrición preventiva, glucosa, colesterol, triglicéridos y salud digestiva.',
    incluye: [
      'Evaluación clínica y nutricional completa',
      'Análisis de composición corporal (presencial) o guía de mediciones en casa (online)',
      'Plan 100% personalizado por menús o equivalentes SMAE, según tus gustos, horarios y presupuesto',
      'Lista de supermercado, recetario práctico y acceso a portal de seguimiento',
      'Dudas y acompañamiento por WhatsApp entre consultas'
    ]
  },
  renal: {
    id: 'renal',
    nombre: 'Consulta de Nutrición Renal Especializada',
    precio: 800,
    enfoque: 'Enfermedad renal crónica etapas 1 a 5, prediálisis, hemodiálisis, diálisis peritoneal, nefropatía diabética o cálculos renales.',
    incluye: [
      'Interpretación de laboratorios renales: creatinina, eGFR, urea, BUN, ácido úrico, proteinuria/albuminuria y electrolitos',
      'Cálculo de proteínas de alto valor biológico, sodio, potasio, fósforo, calcio y líquidos según guías KDOQI',
      'Plan adaptado a la comida mexicana, con técnicas de desmineralización (lixiviación y doble cocción), control de fósforo oculto y sazonadores sin sal',
      'Seguimiento estrecho por WhatsApp: síntomas, presión arterial y ajustes según laboratorios'
    ]
  }
};

const modalidades = {
  online: {
    id: 'online',
    nombre: 'En línea',
    detalle: 'Videollamada en vivo por Zoom, Google Meet o WhatsApp Video. Historia clínica, revisión de laboratorios, menús con ingredientes de tu zona, plan digital y seguimiento por WhatsApp.'
  },
  presencial: {
    id: 'presencial',
    nombre: 'Presencial',
    detalle: 'En el consultorio de Providencia. Historia clínica-nutricional, antropometría completa, composición corporal (grasa, músculo, agua y somatocarta ISAK), material didáctico y plan personalizado.'
  }
};

module.exports = { info, servicios, modalidades };
