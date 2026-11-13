# DESIGN.md — L.N.C. Valeria Méndez Ortega · Nutrición Clínica y Renal

Dirección: **clínica cálida**. Rigor de especialista (tipografía editorial, datos claros)
con calidez de cocina mexicana. Verde = salud y acción. Petróleo = confianza
médica. Azul marino (su blusa en las fotos) = acento único. Solo tema claro.

Idea propia: el lenguaje del **reporte de laboratorio** (valores, rangos, unidades)
como detalle visual: chips con eGFR, potasio, glucosa flotan junto al retrato. La hoja
del logotipo es la forma que recorta el retrato.

Base: logotipo y paleta oficial del kit. Sin referencias UXKIN (no conectado):
la dirección sale del kit, las fotos y las reglas del skill.

## Color (60 / 30 / 10)

| Token | Valor | Rol |
|---|---|---|
| `--paper` | `#F5F7F2` | Fondo general (blanco con tinte salvia, combina con la madera de la foto) |
| `--surface` | `#FFFFFF` | Tarjetas, formularios, chat |
| `--mist` | `#E7EFE9` | Bloques suaves, chips, hover de filas |
| `--line` | `#D5E0D8` | Bordes 1px |
| `--ink` | `#0F172A` | Texto principal (contraste 16:1 sobre paper) |
| `--ink-2` | `#3B4A5A` | Texto secundario (8.3:1) |
| `--ink-3` | `#5E6B78` | Ayudas, metadatos (5.0:1) |
| `--primary` | `#15803D` | Botones primarios, links, foco (4.9:1 con blanco) |
| `--primary-hi` | `#10B981` | Detalles decorativos, gráficos, puntos vivos. Nunca texto sobre blanco |
| `--petrol` | `#0F766E` | Secciones oscuras, encabezados de tarjeta renal, mapa |
| `--petrol-deep` | `#0B3B3A` | Fondo de bloques oscuros (agenda, footer) |
| `--navy` | `#1E3A8A` | Acento único: insignia "Renal", número de paso activo, punto del chat. Máx 10% |
| `--success` | `#15803D` | Pago aprobado |
| `--warning` | `#B45309` | Aviso modo prueba |
| `--error` | `#B42318` | Errores de formulario, pago rechazado |

## Tipografía

- Display: **Young Serif** 400 — títulos h1/h2, precios grandes. Serif gruesa y amable, de recetario; nada de cursivas de acento.
- Texto: **Figtree** 400 / 500 / 600 / 700 — todo lo demás. Sin etiquetas en mayúsculas.
- Escala (px / line-height): 13/1.45 · 15/1.55 · 17/1.6 (body) · 20/1.45 · 26/1.25 · 36/1.1 · 52/1.02 · 76/0.98 (h1 desktop, clamp).
- Body 17px, línea máx 66ch. Números tabulares (`font-variant-numeric: tabular-nums`) en precios, horas, tarjeta.

## Espaciado

Escala de 4: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128.
Sección: 96px desktop / 64px móvil. Contenido máx 1200px, gutter 24px (16px en móvil).

## Forma y profundidad

Radios: 8 (inputs, chips) · 14 (botones, tarjetas pequeñas) · 24 (tarjetas grandes, chat) · 999 (píldoras).
Bordes primero: 1px `--line`. Sombras solo dos:
- `--shadow-1`: `0 1px 2px rgba(15,23,42,.06), 0 4px 12px rgba(15,23,42,.05)` (tarjetas)
- `--shadow-2`: `0 12px 40px -8px rgba(11,59,58,.25)` (chat abierto, tarjeta de pago flotante)

## Componentes

- **Botón primario**: fondo `--primary`, texto blanco 600, alto 48, radio 14. Hover: oscurece 8% + flecha se mueve 3px. Activo: scale .97. Foco: anillo 3px `--primary-hi` con offset 2. Deshabilitado: 45% opacidad, sin hover.
- **Botón secundario**: borde 1px `--ink`, texto `--ink`. Hover: fondo `--ink`, texto blanco.
- **Botón quieto**: solo texto `--primary` con subrayado al hover.
- **Link**: `--primary`, subrayado 1px offset 3.
- **Input**: alto 48, borde `--line`, radio 8, etiqueta visible arriba. Error bajo el campo en `--error`, se valida al salir del campo.
- **Tarjeta**: `--surface`, borde `--line`, radio 24, `--shadow-1`.
- **Navegación**: barra fija, se vuelve sólida con blur ligero al hacer scroll; en móvil menú de pantalla completa.
- **Footer**: `--petrol-deep`, texto blanco 80%.

## Imágenes e iconos

- Fotos oficiales del kit: retrato recortado (hero) y consultorio (Sobre mí). WebP.
- Iconos: SVG de trazo 1.75px, estilo Lucide, dibujados a mano en línea. Sin emoji.
- Ilustración propia: silueta de riñón y hoja en línea, se "dibuja" al hacer scroll.

## Movimiento

Duraciones: 150 (micro), 240 (UI), 500 (entradas), 900 (hero). Easing: `cubic-bezier(.22,1,.36,1)` (salida suave).
Solo se animan `transform`, `opacity`, `clip-path`, `stroke-dashoffset`.
`prefers-reduced-motion: reduce` → todo aparece sin movimiento.

## Revisión contra lo genérico (frontend-design)

- Quité el acento barro/terracota y la serif de alto contraste: es el patrón "crema + serif + terracota" típico de IA. Ahora acento azul marino tomado de la foto real.
- Sin eyebrows en mayúsculas, sin "→" pegado a los botones, sin puntos medios en metadatos.
- Numeración solo en la agenda (es un proceso real de 5 pasos).
- Las dos consultas no son tarjetas gemelas: General es clara, Renal es petróleo oscuro con el riñón dibujado.
