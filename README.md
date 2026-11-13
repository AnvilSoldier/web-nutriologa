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
2. En [railway.com](https://railway.com): **New Project → Deploy from GitHub repo** → elige el repositorio. Railway construye con el `Dockerfile` (Node 22, `npm ci` y `node src/server.js`; ver `railway.json`).
3. En el servicio: **Settings → Networking → Generate Domain** para tener la URL pública.
4. **Variables** (opcional pero recomendado):
   - `ADMIN_KEY` = una clave tuya para ver las citas en `/admin?key=...`
   - `DATA_DIR` = `/data`
   - `SITE_URL` = tu dominio final, p. ej. `https://www.tudominio.mx` (SEO: canonical, sitemap y datos estructurados usan ese dominio y el dominio de Railway redirige a él con 301)
5. **Volume** (para que las citas no se borren en cada deploy): en el servicio, **+ New → Volume**, móntalo en `/data`.

Sin GitHub también se puede con la CLI: `npm i -g @railway/cli`, `railway login`, `railway init`, `railway up` desde esta carpeta.

## Correos

Al aprobarse un pago salen dos correos: aviso al consultorio (`NOTIFY_TO`, por defecto `nutricionslim.dm@gmail.com`) y confirmación al paciente con el archivo de calendario.

Railway bloquea el SMTP en Free/Trial/Hobby, así que en Railway los correos salen por el **puente del servidor ICU** (`proxy_smtp.php`, el mismo de Vida Nutritiva): la web manda el correo por HTTPS al puente y el puente lo entrega por SMTP. Fuera de Railway se intenta SMTP directo y, si falla, el puente.

Variables (mismos nombres que Vida Nutritiva; ejemplo en `.env.example`):

| Variable | Qué es |
|---|---|
| `MAIL_PROXY_URL` | URL del puente, p. ej. `https://…icu/proxy_smtp.php` |
| `MAIL_PROXY_SECRET` | Secreto del puente |
| `MAIL_SERVER` | Servidor SMTP de la cuenta (`SMTP_HOST` también sirve) |
| `MAIL_PORT` | `465` (por defecto) o `587` |
| `MAIL_USE_SSL` | `True`/`False` |
| `MAIL_USERNAME` | Cuenta que envía (`SMTP_USER`) |
| `MAIL_PASSWORD` | Contraseña de esa cuenta (`SMTP_PASS`) |
| `MAIL_FROM` | Remitente visible. Por defecto `"Consultorio L.N.C. Valeria Méndez Ortega" <MAIL_USERNAME>` |
| `NOTIFY_TO` | A quién avisar. Varios con coma |
| `MAIL_FORCE_BRIDGE` | `true` para usar siempre el puente |
| `RESEND_API_KEY` | Opcional: enviar por la API de Resend |

- El correo se manda completo (remitente, Reply-To y adjunto .ics) dentro de `raw_email`, así el puente no le pone el nombre de Vida Nutritiva.
- Ninguna clave va en el código: todo sale de variables de entorno.
- Los correos salen solo con pago aprobado; si fallan, la cita igual queda guardada.
- Prueba en `/admin/test-email?key=TU_CLAVE`. En `/admin` se ve el estado de cada aviso.

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
src/mailer.js      correos de cita confirmada (puente ICU, SMTP o Resend)
src/ics.js         archivo de calendario de la cita
src/chatbot.js     algoritmo del chat
public/            página, estilos, scripts, imágenes
DESIGN.md          sistema de diseño
SEO.md             posicionamiento para "nutrióloga en Guadalajara": qué tiene la web y qué falta fuera de ella
```
