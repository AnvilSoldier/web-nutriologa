// Pasarela de pago SIMULADA (modo prueba).
// Solo acepta tarjetas de prueba conocidas: ningún número real se procesa ni se guarda.
// Para cobrar de verdad, cambia esta función por Stripe, Mercado Pago, Conekta u Openpay.
const crypto = require('crypto');

const TEST_CARDS = {
  '4242424242424242': { result: 'approved', brand: 'visa' },
  '5555555555554444': { result: 'approved', brand: 'mastercard' },
  '378282246310005': { result: 'approved', brand: 'amex' },
  '4000000000000002': { result: 'declined', brand: 'visa', code: 'card_declined', message: 'El banco rechazó la tarjeta. Prueba con otra tarjeta.' },
  '4000000000009995': { result: 'declined', brand: 'visa', code: 'insufficient_funds', message: 'Fondos insuficientes. Prueba con otra tarjeta.' }
};

function luhn(num) {
  let sum = 0; let dbl = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = num.charCodeAt(i) - 48;
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d; dbl = !dbl;
  }
  return sum % 10 === 0;
}

function brandOf(num) {
  if (/^4/.test(num)) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(num)) return 'mastercard';
  if (/^3[47]/.test(num)) return 'amex';
  return 'otra';
}

function validateCard(card, now = new Date()) {
  const errors = {};
  const number = String(card?.number || '').replace(/\D/g, '');
  const name = String(card?.name || '').trim();
  const exp = String(card?.exp || '').replace(/\s/g, '');
  const cvc = String(card?.cvc || '').replace(/\D/g, '');
  const brand = brandOf(number);

  if (number.length < 13 || number.length > 19 || !luhn(number)) errors.number = 'Revisa el número de la tarjeta.';
  if (name.length < 3) errors.name = 'Escribe el nombre como aparece en la tarjeta.';
  const m = exp.match(/^(\d{2})\/(\d{2})$/);
  if (!m) errors.exp = 'Usa el formato MM/AA.';
  else {
    const month = Number(m[1]); const year = 2000 + Number(m[2]);
    const endOfMonth = new Date(Date.UTC(year, month, 1));
    if (month < 1 || month > 12) errors.exp = 'El mes debe ir de 01 a 12.';
    else if (endOfMonth <= now) errors.exp = 'La tarjeta está vencida.';
  }
  const cvcLen = brand === 'amex' ? 4 : 3;
  if (cvc.length !== cvcLen) errors.cvc = `El código tiene ${cvcLen} dígitos.`;
  return { ok: Object.keys(errors).length === 0, errors, number, brand };
}

// Simula un cargo. Devuelve { ok, charge } o { ok:false, code, message }
async function charge({ amount, card, description }) {
  const v = validateCard(card);
  if (!v.ok) return { ok: false, code: 'invalid_card', message: 'Revisa los datos de la tarjeta.', fields: v.errors };

  const test = TEST_CARDS[v.number];
  if (!test) {
    return {
      ok: false, code: 'test_mode',
      message: 'Modo prueba: usa la tarjeta 4242 4242 4242 4242. No se aceptan tarjetas reales.',
      fields: { number: 'Modo prueba: usa 4242 4242 4242 4242.' }
    };
  }
  await new Promise(r => setTimeout(r, 900)); // latencia de una pasarela real
  if (test.result !== 'approved') return { ok: false, code: test.code, message: test.message, fields: { number: test.message } };

  return {
    ok: true,
    charge: {
      id: 'ch_test_' + crypto.randomBytes(8).toString('hex'),
      amount, currency: 'MXN', description,
      brand: test.brand, last4: v.number.slice(-4),
      authCode: String(crypto.randomInt(100000, 999999)),
      test: true, createdAt: new Date().toISOString()
    }
  };
}

module.exports = { charge, validateCard, luhn, TEST_CARDS };
