// Mapa interactivo del consultorio (Leaflet + OpenStreetMap, sin llaves de API)
(() => {
  const el = document.getElementById('map');
  if (!el) return;
  const SPOT = [20.7026, -103.38465];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let map;

  function init() {
    if (map || !window.L) return;
    map = L.map(el, { scrollWheelZoom: false, zoomControl: true, attributionControl: true, tap: true })
      .setView(reduce ? SPOT : [20.6767, -103.3475], reduce ? 16 : 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    const icon = L.divIcon({
      className: '', iconSize: [56, 56], iconAnchor: [28, 44], popupAnchor: [0, -40],
      html: '<div class="pin"><span class="pin__ring"></span><span class="pin__body"><img src="/img/logo.webp" alt=""></span></div>'
    });
    const marker = L.marker(SPOT, { icon, title: 'Consultorio de Nutrición', keyboard: true, alt: 'Consultorio' }).addTo(map);
    marker.bindPopup('<strong>Consultorio 304</strong>Av. Rubén Darío #1450<br>Col. Providencia, Guadalajara<br><a href="https://www.google.com/maps/dir/?api=1&destination=20.7026,-103.38465" target="_blank" rel="noopener">Abrir ruta en Google Maps</a>');

    // círculo suave que marca la zona
    L.circle(SPOT, { radius: 260, color: '#0F766E', weight: 1, fillColor: '#10B981', fillOpacity: .08 }).addTo(map);

    // la rueda del mouse hace zoom solo después de hacer clic en el mapa
    map.on('click', () => map.scrollWheelZoom.enable());
    el.addEventListener('mouseleave', () => map.scrollWheelZoom.disable());

    const fly = () => { map.flyTo(SPOT, 16, { duration: reduce ? 0 : 2.2 }); setTimeout(() => marker.openPopup(), reduce ? 0 : 2300); };
    if (!reduce) setTimeout(fly, 250); else marker.openPopup();
    document.querySelector('[data-map-recenter]')?.addEventListener('click', fly);
  }

  // carga el mapa cuando la sección se acerca a la pantalla
  // Leaflet se descarga solo cuando el mapa está por aparecer (página inicial más ligera)
  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/vendor/leaflet/leaflet.css';
      document.head.prepend(css);
      const js = document.createElement('script'); js.src = '/vendor/leaflet/leaflet.js';
      js.onload = resolve; js.onerror = reject; document.head.appendChild(js);
    });
  }
  const io = new IntersectionObserver(es => {
    if (!es.some(e => e.isIntersecting)) return;
    io.disconnect();
    loadLeaflet().then(init).catch(() => { el.innerHTML = '<p style="padding:24px">No se pudo cargar el mapa. Dirección: Av. Rubén Darío #1450, Consultorio 304, Col. Providencia, Guadalajara.</p>'; });
  }, { rootMargin: '400px' });
  if (document.readyState === 'complete') io.observe(el); else addEventListener('load', () => io.observe(el));

  window.__focusMap = () => { document.getElementById('ubicacion').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); };
})();
