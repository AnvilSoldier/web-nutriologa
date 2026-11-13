# SEO — "Nutrióloga en Guadalajara"

Objetivo: aparecer en Google (resultados normales y el mapa de 3 negocios) cuando alguien busca
**nutrióloga en Guadalajara**, **nutriólogo en Guadalajara**, **nutrióloga renal Guadalajara**,
**nutrióloga en Providencia** y búsquedas parecidas.

Hoy la primera página de "nutrióloga en Guadalajara" la ocupan directorios (Doctoralia, Top Doctors)
y el mapa de Google. Por eso se trabaja en dos frentes: la web (ya hecho) y la presencia fuera de ella (pendiente).

## Lo que ya tiene la web

- **Título y descripción** con la frase exacta al inicio: `Nutrióloga en Guadalajara | L.N.C. Valeria Méndez · Clínica y Renal`.
- **H1** que empieza con "Nutrióloga en Guadalajara" sin cambiar el diseño (la etiqueta verde del hero es parte del H1).
- **Texto local** en hero, "Sobre mí", "Lo que atiende", ubicación y pie: Providencia, Guadalajara, Zapopan, Tlaquepaque, Tonalá, Tlajomulco.
- **Preguntas frecuentes nuevas** con lo que la gente busca: costo de la consulta, dirección y horario, qué hace una nutrióloga renal, si atiende Zapopan/Tlaquepaque/Tonalá.
- **Datos estructurados (schema.org)**: `MedicalClinic` (dirección, coordenadas, horario, precios, zonas que atiende, especialidades DietNutrition y Renal),
  `Person` (cédulas, CUCS, certificaciones), `WebSite`, `WebPage` y `FAQPage` (el servidor lo arma leyendo las preguntas visibles, así nunca se desfasan).
- **Técnico**: `canonical`, `robots.txt`, `sitemap.xml` con imágenes, `llms.txt` (para buscadores con IA), Open Graph y Twitter con URL absoluta,
  compresión gzip, caché larga de CSS/JS con versión por contenido, `noindex` en 404, `/admin` y `/api`.
- **Un solo dominio**: con la variable `SITE_URL` todo redirige (301) al dominio oficial.

## Lo que falta (fuera del código) — en orden de impacto

1. **Dominio propio** (p. ej. `valeriamendeznutriologa.mx`) y ponerlo en Railway + variable `SITE_URL`.
2. **Google Business Profile** (es lo que más pesa para salir en el mapa):
   - Categoría principal **Nutricionista**; secundarias **Dietista** y **Servicio de asesoramiento nutricional**.
   - Nombre real del consultorio (sin meter palabras clave de más: Google lo penaliza).
   - Misma dirección, teléfono y horario que la web, enlace a la web y botón de citas a `https://TU-DOMINIO/#agenda`.
   - Servicios con precio (consulta general $500, renal $800), fotos reales del consultorio y la fachada, publicaciones cada semana.
3. **Reseñas en Google**: pedirlas por WhatsApp después de cada consulta (enlace directo de reseña). Responder todas. Meta: 20+ con texto que mencione el servicio.
4. **Google Search Console**: verificar el dominio, enviar `https://TU-DOMINIO/sitemap.xml` y pedir indexación.
5. **Directorios con los mismos datos (NAP idéntico)**: Doctoralia, Top Doctors, Facebook, Instagram (enlace en bio), Bing Places, Apple Maps (Business Connect).
6. **Enlaces locales**: Colegio Mexicano de Nutrición Renal, egresados CUCS, nefrólogos y clínicas de hemodiálisis de Guadalajara que puedan referir pacientes.
7. **Contenido nuevo** (cuando haya tiempo): páginas o artículos como "Nutrióloga renal en Guadalajara", "Dieta para hemodiálisis con comida mexicana",
   "Cuánto cuesta un nutriólogo en Guadalajara". Cada uno enlazando a la agenda.

## Cómo revisar

- Prueba de resultados enriquecidos: https://search.google.com/test/rich-results
- Validador de schema: https://validator.schema.org
- PageSpeed Insights: https://pagespeed.web.dev
- `npm test` incluye pruebas de título, H1, canonical, datos estructurados, robots, sitemap y 404.
