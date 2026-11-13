# Web — L.N.C. Valeria Méndez Ortega · Nutrición Clínica y Renal

Sitio web con agenda en línea, pago con tarjeta (modo prueba), mapa interactivo y chat que responde con la información oficial del consultorio.

## Qué incluye

- **Landing** con animaciones (entrada del hero, chips de laboratorio con parallax, precios que cuentan, riñón que se dibuja, selector en línea/presencial, FAQ animado). Respeta "reducir movimiento".
- **Agenda**: consulta → día → hora → datos → pago → folio. Horario real (L-V 9-14 y 16-20, Sáb 9-14), citas de 60 min, mínimo 2 h de anticipación, 45 días hacia adelante. Un horario pagado ya no aparece para nadie más.
- **Pago simulado**: solo acepta tarjetas de prueba. Nunca se guarda el número completo (solo marca y últimos 4).
  - `4242 4242 4242 4242` aprobada (Visa)
  - `5555 5555 5555 4444` aprobada (Mastercard)
  - `4000 0000 0000 0002` rechazada
  - `4000 0000 0000 9995` fondos insuficientes
  - Cualquier fecha futura y cualquier CVC.
- **Confirmación** con folio, archivo de calendario (.ics) y aviso por WhatsApp.
- **Mapa** Leaflet + OpenStreetMap (sin llaves de API) en Av. Rubén Darío 1450, con estado "abierto ahora".
- **Chat**: algoritmo propio (TF-IDF + sinónimos + corrección de errores de dedo) sobre la información oficial. Además da datos en vivo: si está abierto ahora y los próximos horarios libres de la agenda. Si no sabe algo, lo dice y manda a WhatsApp. Detecta frases de urgencia y manda al 911.
- **Panel de citas**: `/admin?key=TU_CLAVE` (define `ADMIN_KEY`).
- **Correos al confirmar**: cuando el pago se aprueba, llega un aviso a `nutricionslim.dm@gmail.com` (con los datos del paciente) y el paciente recibe su confirmación con el archivo de calendario. Ver "Correos" abajo.

## Correr en tu computadora

```bash
npm install
npm start
# abre http://localhost:3000
npm test   # pruebas del chat, pagos y horarios
```

## Subir a Railway

1. Sube esta carpeta a un repositorio de GitHub (puede ser privado).
2. En [railway.com](https://railway.com): **New Project → Deploy from GitHub repo** → elige el repositorio. Railway detecta Node, corre `npm install` y `npm start` (ver `railway.json`).
3. En el servicio: **Settings → Networking → Generate Domain** para tener la URL pública.
4. **Variables** (opcional pero recomendado):
   - `ADMIN_KEY` = una clave tuya para ver las citas en `/admin?key=...`
   - `DATA_DIR` = `/data`
5. **Volume** (para que las citas no se borren en cada deploy): en el servicio, **+ New → Volume**, móntalo en `/data`.

Sin GitHub también se puede con la CLI: `npm i -g @railway/cli`, `railway login`, `railway init`, `railway up` desde esta carpeta.

## Correos

Pon estas variables en Railway (**Variables**) o en tu `.env`. Ejemplo en `.env.example`.

| Variable | Qué es |
|---|---|
| `SMTP_HOST` | Servidor SMTP, p. ej. `smtp.gmail.com` |
| `SMTP_PORT` | `465` (SSL, por defecto) o `587` |
| `SMTP_SECURE` | `true`/`false`. Por defecto `true` si el puerto es 465 |
| `SMTP_USER` | Usuario de la cuenta |
| `SMTP_PASS` | Contraseña. En Gmail usa una **contraseña de aplicación** (requiere verificación en 2 pasos) |
| `MAIL_FROM` | Remitente. Por defecto `SMTP_USER` |
| `NOTIFY_TO` | A quién avisar. Por defecto `nutricionslim.dm@gmail.com`. Varios con coma |
| `RESEND_API_KEY` | Opcional. Si existe, se envía por la API de Resend en vez de SMTP |

- Los correos salen solo cuando el pago fue aprobado. Un pago rechazado no manda nada.
- Se envían después de responder al paciente; si el correo falla, la cita igual queda guardada.
- Prueba la configuración en `/admin/test-email?key=TU_CLAVE`. En `/admin` se ve si cada aviso salió (`enviado`, `error` o `sin_configurar`).
- **Ojo con Railway**: en los planes Free, Trial y Hobby, Railway bloquea los puertos SMTP. Ahí usa el plan Pro o pon `RESEND_API_KEY` (con `MAIL_FROM` de un dominio verificado en Resend).

## Cambiar datos

Todo dato del consultorio (precios, horario, dirección, teléfono, cédulas) vive en `src/info.js`. El chat y la agenda lo leen de ahí. Los textos de la página están en `public/index.html`.

## Cobrar de verdad

Cambia `src/payments.js` por una pasarela real (Stripe, Mercado Pago, Conekta u Openpay). Con una pasarela real el número de tarjeta lo captura su formulario seguro, no este servidor.

## Archivos

```
src/server.js      servidor Express y API
src/info.js        datos oficiales del consultorio
src/schedule.js    horarios y disponibilidad (hora de Guadalajara)
src/store.js       guardado de citas (JSON)
src/payments.js    pasarela simulada
src/mailer.js      correos de cita confirmada (SMTP o Resend)
src/ics.js         archivo de calendario de la cita
src/chatbot.js     algoritmo del chat
public/            página, estilos, scripts, imágenes
DESIGN.md          sistema de diseño
```
