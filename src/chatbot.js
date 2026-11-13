// Asistente del consultorio: algoritmo de recuperación (sin IA externa).
// 1) Normaliza el texto (minúsculas, sin acentos, sinónimos, raíces).
// 2) Compara contra preguntas de ejemplo de cada tema con TF-IDF + similitud coseno,
//    tolerando errores de dedo (distancia de Levenshtein).
// 3) Responde con información oficial del consultorio y, cuando aplica, con datos en vivo
//    (si está abierto ahora, próximos horarios libres de la agenda real).
const { info, servicios, modalidades } = require('./info');
const schedule = require('./schedule');
const store = require('./store');

const wa = (text) => `https://wa.me/${info.whatsapp}?text=${encodeURIComponent(text)}`;
const money = (n) => `$${n.toLocaleString('es-MX')} MXN`;

// ---------- Texto ----------
const STOP = new Set(('a al algo algun alguna como con cual cuales cuando de del el ella ellas ellos en era es esa ese eso esta este esto ha hay la las le les lo los me mi mis muy no o para pero por que se si sin sobre su sus te ti tu tus un una uno unos y ya yo usted ustedes favor quisiera quiero queria saber puedo podria pueden tienen tiene hacer hace ser estar soy mas tambien entonces bueno ok oye disculpa gustaria necesito necesitaria informacion info pregunta').split(' '));

// Sinónimos -> palabra canónica (antes de sacar raíz)
const SYN = {
  rinon: 'renal', rinones: 'renal', nefrologia: 'renal', nefrologica: 'renal', nefrologico: 'renal', nefropatia: 'renal', erc: 'renal', irc: 'renal',
  costo: 'precio', costos: 'precio', cuesta: 'precio', cuestan: 'precio', cobra: 'precio', cobran: 'precio', tarifa: 'precio', tarifas: 'precio', valor: 'precio', cuanto: 'precio', pesos: 'precio', honorarios: 'precio',
  virtual: 'online', linea: 'online', videollamada: 'online', zoom: 'online', meet: 'online', distancia: 'online', remota: 'online', remoto: 'online',
  fisica: 'presencial', persona: 'presencial', consultorio: 'presencial',
  donde: 'ubicacion', direccion: 'ubicacion', ubicados: 'ubicacion', ubican: 'ubicacion', ubicada: 'ubicacion', llegar: 'ubicacion', mapa: 'ubicacion', domicilio: 'ubicacion',
  horarios: 'horario', domingo: 'horario', domingos: 'horario', sabado: 'horario', sabados: 'horario', lunes: 'horario', viernes: 'horario', fin: 'horario', semana: 'horario', hoy: 'horario', manana: 'horario', abren: 'horario', abierto: 'horario', abierta: 'horario', cierran: 'horario', atienden: 'horario', hora: 'horario', horas: 'horario',
  cita: 'agendar', citas: 'agendar', agenda: 'agendar', reservar: 'agendar', reserva: 'agendar', apartar: 'agendar', sacar: 'agendar', programar: 'agendar', turno: 'agendar', disponibilidad: 'agendar', disponible: 'agendar', espacio: 'agendar', lugar: 'agendar',
  telefono: 'contacto', whatsapp: 'contacto', whats: 'contacto', wsp: 'contacto', celular: 'contacto', correo: 'contacto', email: 'contacto', mail: 'contacto', numero: 'contacto', llamar: 'contacto',
  instagram: 'redes', facebook: 'redes', insta: 'redes', face: 'redes',
  laboratorio: 'estudios', laboratorios: 'estudios', analisis: 'estudios', quimica: 'estudios', examen: 'estudios', examenes: 'estudios', sangre: 'estudios', orina: 'estudios',
  cedula: 'formacion', cedulas: 'formacion', estudio: 'formacion', estudiaste: 'formacion', estudio_: 'formacion', titulo: 'formacion', universidad: 'formacion', certificacion: 'formacion', certificaciones: 'formacion', experiencia: 'formacion', isak: 'formacion',
  azucar: 'diabetes', glucosa: 'diabetes', insulina: 'diabetes', diabetica: 'diabetes', diabetico: 'diabetes', prediabetes: 'diabetes',
  presion: 'hipertension', hipertenso: 'hipertension', hipertensa: 'hipertension',
  colesterol: 'lipidos', trigliceridos: 'lipidos', dislipidemia: 'lipidos', grasa_sangre: 'lipidos',
  urico: 'acidourico', gota: 'acidourico', hiperuricemia: 'acidourico',
  bajar: 'peso', adelgazar: 'peso', kilos: 'peso', obesidad: 'peso', sobrepeso: 'peso', perder: 'peso', dieta: 'plan',
  musculo: 'musculo', masa: 'musculo', gym: 'musculo', gimnasio: 'musculo', recomposicion: 'musculo', tonificar: 'musculo',
  colitis: 'digestivo', gastritis: 'digestivo', intestino: 'digestivo', inflamacion: 'digestivo', estrenimiento: 'digestivo', reflujo: 'digestivo', digestiva: 'digestivo',
  hemodialisis: 'dialisis', peritoneal: 'dialisis', dializado: 'dialisis',
  calculos: 'litiasis', piedras: 'litiasis', piedra: 'litiasis', litiasis: 'litiasis',
  trasplante: 'trasplante', trasplantado: 'trasplante', transplante: 'trasplante',
  tarjeta: 'pago', pagar: 'pago', pago: 'pago', efectivo: 'pago', transferencia: 'pago', credito: 'pago', debito: 'pago', cobro: 'pago',
  cancelar: 'cancelar', reprogramar: 'cancelar', cambiar: 'cancelar', mover: 'cancelar', reagendar: 'cancelar',
  extranjero: 'extranjero', eu: 'extranjero', usa: 'extranjero', estados: 'extranjero', espana: 'extranjero', canada: 'extranjero', pais: 'extranjero', fuera: 'extranjero',
  incluye: 'incluye', incluido: 'incluye', trae: 'incluye', contiene: 'incluye', recibo: 'incluye', dan: 'incluye',
  diferencia: 'diferencia', elegir: 'diferencia', conviene: 'diferencia', cual: 'diferencia', recomiendas: 'diferencia',
  potasio: 'mineral', fosforo: 'mineral', sodio: 'mineral', sal: 'mineral', liquidos: 'mineral', proteina: 'mineral', proteinas: 'mineral',
  smae: 'equivalentes', equivalentes: 'equivalentes', supermercado: 'equivalentes', ingredientes: 'equivalentes', mexicana: 'equivalentes', mexico: 'equivalentes', presupuesto: 'equivalentes',
  dura: 'duracion', duracion: 'duracion', tiempo: 'duracion', minutos: 'duracion', tarda: 'duracion',
  seguimiento: 'seguimiento', acompanamiento: 'seguimiento', dudas: 'seguimiento',
  composicion: 'composicion', corporal: 'composicion', antropometria: 'composicion', bascula: 'composicion', medidas: 'composicion', somatocarta: 'composicion',
  estacionamiento: 'estacionamiento', estacionar: 'estacionamiento', parking: 'estacionamiento',
  factura: 'factura', facturar: 'factura', recibo_fiscal: 'factura', rfc: 'factura',
  seguro: 'seguro', aseguradora: 'seguro', gastos: 'seguro',
  ninos: 'ninos', nino: 'ninos', pediatrica: 'ninos', bebe: 'ninos', hijo: 'ninos', hija: 'ninos',
  embarazo: 'embarazo', embarazada: 'embarazo', lactancia: 'embarazo',
  robot: 'bot', humano: 'bot', bot: 'bot', persona_real: 'bot', ia: 'bot'
};

function normalize(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ñ/g, 'n').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function stem(w) {
  if (w.length <= 4) return w;
  for (const suf of ['amientos', 'imientos', 'amiento', 'imiento', 'aciones', 'iciones', 'acion', 'icion', 'mente', 'ables', 'ibles', 'istas', 'ista', 'osos', 'osas', 'oso', 'osa', 'ando', 'iendo', 'ados', 'idas', 'idos', 'adas', 'ado', 'ida', 'ido', 'ada', 'es', 's']) {
    if (w.endsWith(suf) && w.length - suf.length >= 4) return w.slice(0, -suf.length);
  }
  return w;
}

function tokens(s) {
  return normalize(s).split(' ').filter(w => w && !STOP.has(w)).map(w => SYN[w] || w).map(stem);
}

function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return dp[a.length][b.length];
}

// ---------- Respuestas en vivo ----------
function nextFree(limit = 3, modality) {
  const taken = store.takenSet();
  const today = schedule.nowParts().date;
  const out = [];
  for (let i = 0; i <= info.ventanaDias && out.length < limit; i++) {
    const d = schedule.addDays(today, i);
    for (const t of schedule.freeSlots(d, taken)) {
      out.push({ date: d, time: t });
      if (out.length >= limit) break;
    }
  }
  return out;
}

function openNowText() {
  const st = schedule.openStatus();
  if (st.open) return `Ahora mismo el consultorio está abierto, hasta las ${schedule.humanTime(st.until)}.`;
  if (!st.nextDay) return 'Ahora mismo el consultorio está cerrado.';
  const when = st.today ? 'hoy' : schedule.humanDate(st.nextDay);
  return `Ahora mismo está cerrado. Abre ${when} a las ${schedule.humanTime(st.nextTime)}.`;
}

// ---------- Base de conocimiento ----------
// Cada tema: ejemplos (para el algoritmo) y respuesta (texto o función).
const KB = [
  {
    id: 'saludo', examples: ['hola', 'buenas tardes', 'buen dia', 'que tal', 'hey'],
    answer: () => ({ text: `¡Hola! Soy el asistente del consultorio de ${info.nombre}. Pregúntame por costos, horarios, la consulta renal o cómo agendar.`, chips: ['¿Cuánto cuesta?', '¿Dónde están?', 'Próximos horarios'] })
  },
  { id: 'gracias', examples: ['gracias', 'muchas gracias', 'perfecto gracias', 'excelente', 'muy amable'], answer: () => ({ text: 'Con gusto. Si quieres, puedes apartar tu cita aquí mismo en la agenda.', actions: [{ type: 'book', label: 'Agendar cita' }] }) },
  { id: 'adios', examples: ['adios', 'hasta luego', 'bye', 'nos vemos'], answer: () => ({ text: 'Hasta pronto. Aquí estaré si surge otra duda.' }) },
  {
    id: 'precio',
    examples: ['cuanto cuesta la consulta', 'precio de la consulta', 'cuanto cobran', 'costos', 'tarifas', 'que precio tiene', 'cuanto es'],
    answer: () => ({
      text: `Hay dos consultas, en línea o presencial al mismo precio:\n• ${servicios.general.nombre}: ${money(servicios.general.precio)}.\n• ${servicios.renal.nombre}: ${money(servicios.renal.precio)}.`,
      chips: ['¿Qué incluye la general?', '¿Qué incluye la renal?', '¿Cuál me conviene?']
    })
  },
  {
    id: 'precio_renal', examples: ['cuanto cuesta la consulta renal', 'precio consulta de rinon', 'cuanto cobra por renal'],
    answer: () => ({ text: `La ${servicios.renal.nombre} cuesta ${money(servicios.renal.precio)}, en línea o presencial.`, actions: [{ type: 'book', service: 'renal', label: 'Agendar consulta renal' }] })
  },
  {
    id: 'precio_general', examples: ['cuanto cuesta la consulta general', 'precio consulta general', 'precio general', 'precio consulta normal', 'consulta general cuanto cuesta'],
    answer: () => ({ text: `La ${servicios.general.nombre} cuesta ${money(servicios.general.precio)}, en línea o presencial.`, actions: [{ type: 'book', service: 'general', label: 'Agendar consulta general' }] })
  },
  {
    id: 'incluye_general', examples: ['que incluye la consulta general', 'que me dan en la consulta general', 'que trae la consulta de 500'],
    answer: () => ({ text: `La consulta general (${money(servicios.general.precio)}) incluye:\n• ${servicios.general.incluye.join('\n• ')}`, actions: [{ type: 'book', service: 'general', label: 'Agendar consulta general' }] })
  },
  {
    id: 'incluye_renal', examples: ['que incluye la consulta renal', 'que se hace en la consulta renal', 'que trae la consulta de 800', 'consulta renal en que consiste'],
    answer: () => ({ text: `La consulta renal (${money(servicios.renal.precio)}) incluye:\n• ${servicios.renal.incluye.join('\n• ')}`, actions: [{ type: 'book', service: 'renal', label: 'Agendar consulta renal' }] })
  },
  {
    id: 'diferencia', examples: ['cual consulta me conviene', 'diferencia entre general y renal', 'cual elijo', 'que consulta necesito'],
    answer: () => ({ text: `Elige la renal (${money(servicios.renal.precio)}) si tienes enfermedad renal crónica en cualquier etapa, estás en hemodiálisis o diálisis peritoneal, tienes nefropatía diabética, cálculos renales o un trasplante. Para todo lo demás (peso, músculo, glucosa, colesterol, digestión) la general (${money(servicios.general.precio)}) es la indicada.` })
  },
  {
    id: 'online', examples: ['como funciona la consulta en linea', 'dan consulta online', 'es por videollamada', 'atienden a distancia', 'consulta virtual'],
    answer: () => ({ text: `Sí. ${modalidades.online.detalle} Antes de la cita recibes un breve cuestionario clínico y el enlace de la videollamada. Al terminar recibes tu plan digital y seguimiento por WhatsApp.`, chips: ['¿Atienden en el extranjero?', '¿Cuánto cuesta?'] })
  },
  {
    id: 'presencial', examples: ['consulta presencial que incluye', 'atienden en consultorio', 'consulta en persona'],
    answer: () => ({ text: `${modalidades.presencial.detalle} El consultorio está en ${info.direccionCorta}.`, chips: ['¿Dónde están?', 'Horarios'] })
  },
  {
    id: 'composicion', examples: ['miden grasa corporal', 'tienen bascula de composicion corporal', 'hacen antropometria', 'medidas del cuerpo'],
    answer: () => ({ text: 'En consulta presencial se hace evaluación antropométrica completa y análisis de composición corporal: porcentaje de grasa, masa muscular, agua corporal y somatocarta ISAK. En línea recibes una guía práctica para tomar tus medidas en casa.' })
  },
  {
    id: 'estudios', examples: ['que estudios de laboratorio necesito', 'que analisis llevo a la consulta renal', 'necesito laboratorios', 'tengo que llevar examenes'],
    answer: () => ({ text: 'Para la consulta renal lo ideal es llevar una química sanguínea reciente (glucosa, urea, creatinina, ácido úrico), electrolitos séricos de 6 elementos (sodio, potasio, cloro, fósforo, calcio, magnesio) y examen general de orina. Si aún no los tienes, en la primera sesión te indica cuáles pedir según tu etapa.' })
  },
  {
    id: 'ubicacion', examples: ['donde esta el consultorio', 'cual es la direccion', 'como llego', 'en que colonia estan', 'ubicacion'],
    answer: () => ({ text: `El consultorio está en ${info.direccion}. Atiende presencial en la ${info.coberturaPresencial}.`, actions: [{ type: 'map', label: 'Ver en el mapa' }, { type: 'link', label: 'Abrir en Google Maps', href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(info.direccion)}` }] })
  },
  {
    id: 'horario', examples: ['cual es el horario', 'a que hora abren', 'estan abiertos hoy', 'abren los sabados', 'abren el domingo', 'horario de atencion', 'que dias dan consulta', 'dan consulta los domingos', 'atienden en fin de semana'],
    answer: () => ({ text: `${info.horarioTexto}\n${openNowText()}`, chips: ['Próximos horarios'] })
  },
  {
    id: 'agendar', examples: ['como agendo una cita', 'quiero una cita', 'hay disponibilidad', 'proximos horarios libres', 'cuando hay espacio', 'quiero reservar'],
    answer: () => {
      const slots = nextFree(3);
      if (!slots.length) return { text: 'Ahora no hay horarios libres en la agenda en línea. Escribe por WhatsApp y te buscan un espacio.', actions: [{ type: 'link', label: 'Escribir por WhatsApp', href: wa('Hola, quiero agendar una cita') }] };
      const list = slots.map(s => `• ${schedule.humanDate(s.date)}, ${schedule.humanTime(s.time)}`).join('\n');
      return { text: `Puedes agendar y pagar aquí mismo en 2 minutos. Los próximos horarios libres son:\n${list}`, actions: [{ type: 'book', label: 'Abrir agenda' }, { type: 'link', label: 'Prefiero WhatsApp', href: wa('Hola, quiero agendar una cita') }] };
    }
  },
  {
    id: 'pago', examples: ['como se paga', 'aceptan tarjeta', 'formas de pago', 'puedo pagar en efectivo', 'pago con tarjeta de credito'],
    answer: () => ({ text: 'En esta web pagas con tarjeta de crédito o débito al agendar, y recibes tu folio al instante. Para otras formas de pago, pregunta por WhatsApp.', actions: [{ type: 'book', label: 'Agendar y pagar' }, { type: 'link', label: 'WhatsApp', href: wa('Hola, tengo una duda sobre formas de pago') }] })
  },
  {
    id: 'cancelar', examples: ['como cancelo mi cita', 'puedo reprogramar', 'cambiar la fecha de mi cita', 'no puedo ir a mi cita'],
    answer: () => ({ text: 'Para cambiar o cancelar una cita escribe por WhatsApp con tu folio y te ayudan a moverla.', actions: [{ type: 'link', label: 'Escribir por WhatsApp', href: wa('Hola, necesito cambiar mi cita. Mi folio es: ') }] })
  },
  {
    id: 'contacto', examples: ['cual es el telefono', 'numero de whatsapp', 'correo electronico', 'como los contacto'],
    answer: () => ({ text: `WhatsApp y teléfono: ${info.telefono}\nCorreo: ${info.email}\nInstagram: @${info.instagram}`, actions: [{ type: 'link', label: 'Abrir WhatsApp', href: wa('Hola, tengo una pregunta sobre la consulta') }] })
  },
  { id: 'redes', examples: ['tienen instagram', 'facebook', 'redes sociales'], answer: () => ({ text: `Instagram: @${info.instagram}\nFacebook: ${info.facebook}`, actions: [{ type: 'link', label: 'Ver Instagram', href: `https://instagram.com/${info.instagram}` }] }) },
  {
    id: 'formacion', examples: ['donde estudio', 'cual es su cedula', 'que certificaciones tiene', 'esta certificada', 'formacion profesional', 'es especialista'],
    answer: () => ({ text: `${info.nombre} es ${info.titulo}.\n• Licenciatura: ${info.licenciatura}. Cédula ${info.cedulaLic}.\n• ${info.especialidad}. Cédula de especialidad ${info.cedulaEsp}.\n• ${info.certificaciones.join('\n• ')}` })
  },
  {
    id: 'renal_general', examples: ['atiende enfermedad renal', 'tengo insuficiencia renal', 'mis rinones estan mal', 'tengo erc etapa 3', 'creatinina alta', 'filtracion glomerular baja'],
    answer: () => ({ text: `Sí, es su especialidad: enfermedad renal crónica en etapas 1 a 5 prediálisis, hemodiálisis, diálisis peritoneal, nefropatía diabética, cálculos renales y cuidado post-trasplante. La consulta renal (${money(servicios.renal.precio)}) ajusta proteínas, sodio, potasio, fósforo, calcio y líquidos según las guías KDOQI.`, actions: [{ type: 'book', service: 'renal', label: 'Agendar consulta renal' }], chips: ['¿Qué estudios llevo?'] })
  },
  { id: 'dialisis', examples: ['estoy en hemodialisis', 'atiende pacientes en dialisis', 'dialisis peritoneal'], answer: () => ({ text: `Sí. Atiende pacientes en hemodiálisis y diálisis peritoneal con la consulta renal (${money(servicios.renal.precio)}), con control de líquidos, potasio, fósforo y proteína de alto valor biológico.`, actions: [{ type: 'book', service: 'renal', label: 'Agendar consulta renal' }] }) },
  { id: 'trasplante', examples: ['tengo trasplante de rinon', 'paciente trasplantado'], answer: () => ({ text: `Sí, atiende el cuidado nutricional post-trasplante renal en la consulta renal (${money(servicios.renal.precio)}).`, actions: [{ type: 'book', service: 'renal', label: 'Agendar consulta renal' }] }) },
  { id: 'litiasis', examples: ['tengo calculos renales', 'piedras en el rinon', 'litiasis renal'], answer: () => ({ text: `Sí, atiende litiasis renal (cálculos) en la consulta renal (${money(servicios.renal.precio)}).`, actions: [{ type: 'book', service: 'renal', label: 'Agendar consulta renal' }] }) },
  {
    id: 'mineral', examples: ['puedo comer potasio', 'como bajo el fosforo', 'cuanta sal puedo comer', 'cuanta agua tomo si tengo dialisis', 'cuanta proteina debo comer'],
    answer: () => ({ text: 'Depende de tu etapa y tus laboratorios, por eso se calcula a tu medida. Como guía general, la consulta renal trabaja: técnicas de desmineralización de verduras (lixiviación y doble cocción) para bajar potasio, control de aditivos fosforados ocultos en productos procesados y sazonadores naturales sin sal. No cambies tu dieta sin indicación profesional.', actions: [{ type: 'book', service: 'renal', label: 'Agendar consulta renal' }] })
  },
  { id: 'diabetes', examples: ['atiende diabetes', 'tengo resistencia a la insulina', 'glucosa alta', 'sindrome metabolico', 'prediabetes'], answer: () => ({ text: `Sí: diabetes tipo 1 y tipo 2, resistencia a la insulina y síndrome metabólico. Se atiende con la consulta general (${money(servicios.general.precio)}). Si además hay daño renal (nefropatía diabética), te conviene la renal (${money(servicios.renal.precio)}).`, actions: [{ type: 'book', service: 'general', label: 'Agendar consulta' }] }) },
  { id: 'hipertension', examples: ['tengo presion alta', 'atiende hipertension'], answer: () => ({ text: `Sí, atiende hipertensión arterial con la consulta general (${money(servicios.general.precio)}).`, actions: [{ type: 'book', service: 'general', label: 'Agendar consulta' }] }) },
  { id: 'lipidos', examples: ['tengo colesterol alto', 'trigliceridos altos', 'dislipidemia'], answer: () => ({ text: `Sí, atiende colesterol y triglicéridos elevados con la consulta general (${money(servicios.general.precio)}).`, actions: [{ type: 'book', service: 'general', label: 'Agendar consulta' }] }) },
  { id: 'acidourico', examples: ['acido urico alto', 'tengo gota', 'hiperuricemia'], answer: () => ({ text: `Sí, atiende ácido úrico elevado (hiperuricemia) con la consulta general (${money(servicios.general.precio)}).`, actions: [{ type: 'book', service: 'general', label: 'Agendar consulta' }] }) },
  { id: 'peso', examples: ['quiero bajar de peso', 'quiero perder grasa', 'control de peso', 'tengo sobrepeso'], answer: () => ({ text: `Sí. La consulta general (${money(servicios.general.precio)}) cubre control de peso y pérdida de grasa con un plan por menús o equivalentes SMAE adaptado a tus gustos, horarios y presupuesto.`, actions: [{ type: 'book', service: 'general', label: 'Agendar consulta general' }] }) },
  { id: 'musculo', examples: ['quiero ganar masa muscular', 'recomposicion corporal', 'voy al gym y quiero un plan'], answer: () => ({ text: `Sí, recomposición corporal y aumento de masa muscular con la consulta general (${money(servicios.general.precio)}). En presencial se mide tu composición corporal.`, actions: [{ type: 'book', service: 'general', label: 'Agendar consulta general' }] }) },
  { id: 'digestivo', examples: ['tengo colitis', 'gastritis', 'intestino irritable', 'me inflamo mucho'], answer: () => ({ text: `Sí, atiende salud digestiva: colitis, gastritis y síndrome de intestino irritable, con la consulta general (${money(servicios.general.precio)}).`, actions: [{ type: 'book', service: 'general', label: 'Agendar consulta' }] }) },
  { id: 'equivalentes', examples: ['los planes usan comida mexicana', 'alimentos faciles de conseguir', 'es caro el plan', 'que es el smae'], answer: () => ({ text: 'Sí. Todos los planes usan el Sistema Mexicano de Alimentos Equivalentes (SMAE 5ta edición), con ingredientes frescos, accesibles y adaptados a tu presupuesto y estilo de vida. Incluyen lista de supermercado y recetario práctico.' }) },
  { id: 'extranjero', examples: ['vivo en estados unidos puedo tomar consulta', 'atienden fuera de mexico', 'vivo en otro pais'], answer: () => ({ text: `Sí, en línea atiende a ${info.coberturaOnline.toLowerCase()}. Los menús se adaptan a los ingredientes de tu zona.`, actions: [{ type: 'book', modality: 'online', label: 'Agendar en línea' }] }) },
  { id: 'seguimiento', examples: ['hay seguimiento', 'puedo escribir dudas despues', 'acompanamiento entre consultas'], answer: () => ({ text: 'Sí. Las dos consultas incluyen seguimiento por WhatsApp entre citas para resolver dudas; en la renal es un seguimiento estrecho de síntomas, presión arterial y ajustes según laboratorios.' }) },
  { id: 'duracion', examples: ['cuanto dura la consulta', 'cuanto tiempo tarda'], answer: () => ({ text: `En la agenda cada cita reserva un espacio de ${info.duracionCitaMin} minutos.` }) },
  { id: 'bot', examples: ['eres un robot', 'eres humano', 'hablo con una persona'], answer: () => ({ text: 'Soy un asistente automático con la información oficial del consultorio. Para algo personal o médico, escribe por WhatsApp y te responde el consultorio.', actions: [{ type: 'link', label: 'WhatsApp', href: wa('Hola, tengo una pregunta') }] }) },
  // Temas sin información oficial: se responde con honestidad y se canaliza.
  { id: 'estacionamiento', examples: ['hay estacionamiento', 'donde me estaciono'], answer: () => ({ text: `No tengo ese dato. La dirección es ${info.direccionCorta}; por WhatsApp te dicen dónde estacionarte.`, actions: [{ type: 'link', label: 'Preguntar por WhatsApp', href: wa('Hola, ¿hay estacionamiento cerca del consultorio?') }] }) },
  { id: 'factura', examples: ['dan factura', 'puedo facturar'], answer: () => ({ text: 'No tengo ese dato. Pregunta por facturación por WhatsApp.', actions: [{ type: 'link', label: 'Preguntar por WhatsApp', href: wa('Hola, ¿emiten factura?') }] }) },
  { id: 'seguro', examples: ['aceptan seguro de gastos medicos', 'trabajan con aseguradora'], answer: () => ({ text: 'No tengo ese dato. Pregunta por WhatsApp si aplica tu seguro.', actions: [{ type: 'link', label: 'Preguntar por WhatsApp', href: wa('Hola, ¿aceptan seguro de gastos médicos?') }] }) },
  { id: 'ninos', examples: ['atiende ninos', 'consulta pediatrica', 'mi hijo necesita nutriologa'], answer: () => ({ text: 'La información oficial no menciona consulta pediátrica. Escribe por WhatsApp con la edad y el motivo, y te dicen si te pueden atender.', actions: [{ type: 'link', label: 'Preguntar por WhatsApp', href: wa('Hola, ¿atienden a niños?') }] }) },
  { id: 'embarazo', examples: ['estoy embarazada', 'nutricion en lactancia'], answer: () => ({ text: 'La información oficial no menciona atención en embarazo o lactancia. Pregunta por WhatsApp para confirmarlo.', actions: [{ type: 'link', label: 'Preguntar por WhatsApp', href: wa('Hola, ¿atienden en embarazo o lactancia?') }] }) }
];

// ---------- Índice TF-IDF ----------
const docs = KB.map(k => ({ id: k.id, toks: k.examples.flatMap(tokens) }));
const vocab = new Set(docs.flatMap(d => d.toks));
const df = {};
for (const d of docs) for (const t of new Set(d.toks)) df[t] = (df[t] || 0) + 1;
const N = docs.length;
const idf = t => Math.log(1 + N / (df[t] || N));
function vec(toks) {
  const v = {};
  for (const t of toks) v[t] = (v[t] || 0) + 1;
  for (const t in v) v[t] = (1 + Math.log(v[t])) * idf(t);
  return v;
}
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (const t in a) { na += a[t] ** 2; if (b[t]) dot += a[t] * b[t]; }
  for (const t in b) nb += b[t] ** 2;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
const docVecs = docs.map(d => ({ id: d.id, v: vec(d.toks) }));

// corrige palabras parecidas a las del vocabulario (errores de dedo)
function fuzzy(toks) {
  return toks.map(t => {
    if (vocab.has(t) || t.length < 5) return t;
    let best = t, bestD = 2;
    for (const w of vocab) {
      if (Math.abs(w.length - t.length) > 1) continue;
      const d = lev(t, w);
      if (d < bestD) { best = w; bestD = d; }
    }
    return best;
  });
}

const EMERGENCIA = /(duele (mucho )?el pecho|dolor (fuerte )?(de|en el) pecho|pecho me duele|no puedo respirar|falta de aire|desmay|convulsi|no he orinado|no orino|sangrado|vomito con sangre|me quiero morir|confusion|perdida del conocimiento)/;

function reply(message) {
  const raw = String(message || '').slice(0, 500);
  const n = normalize(raw);
  if (!n) return { text: 'Escribe tu pregunta, por ejemplo: ¿cuánto cuesta la consulta renal?' };

  if (EMERGENCIA.test(n)) {
    return { id: 'emergencia', text: 'Eso puede ser una urgencia. Llama al 911 o acude a urgencias ahora. Este chat no da atención médica de emergencia.' };
  }

  const q = vec(fuzzy(tokens(raw)));
  const scored = docVecs.map(d => ({ id: d.id, s: cosine(q, d.v) })).sort((a, b) => b.s - a.s);
  const top = scored[0];

  if (!top || top.s < 0.22) {
    return {
      id: 'fallback',
      text: 'No encontré esa información. Puedo ayudarte con costos, horarios, ubicación, la consulta renal o cómo agendar. Para algo más específico, escribe por WhatsApp.',
      chips: ['¿Cuánto cuesta?', 'Horarios', '¿Qué incluye la renal?'],
      actions: [{ type: 'link', label: 'Escribir por WhatsApp', href: wa(`Hola, tengo una pregunta: ${raw}`) }]
    };
  }
  const k = KB.find(x => x.id === top.id);
  return { id: k.id, score: Number(top.s.toFixed(3)), ...k.answer() };
}

module.exports = { reply, tokens, normalize, KB };
