const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'citas-'));
const app = require('../src/server');

let server, base;
test.before(() => new Promise(r => { server = app.listen(0, () => { base = `http://localhost:${server.address().port}`; r(); }); }));
test.after(() => server.close());

test('SEO: título, H1, canonical y datos estructurados', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /<title>Nutrióloga en Guadalajara/);
  assert.match(html, /<h1[^>]*>[\s\S]*Nutrióloga en Guadalajara/);
  assert.match(html, new RegExp(`<link rel="canonical" href="${base}/">`));
  assert.doesNotMatch(html, /__SITE__|__LASTMOD__/);
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
  const graph = blocks.find(b => b['@graph'])['@graph'];
  const clinic = graph.find(n => n['@type'] === 'MedicalClinic');
  assert.equal(clinic.address.addressLocality, 'Guadalajara');
  assert.equal(clinic.telephone, '+52 33 1628 0383');
  const faq = blocks.find(b => b['@type'] === 'FAQPage');
  assert.ok(faq.mainEntity.length >= 7);
  assert.match(faq.mainEntity[0].name, /nutrióloga en Guadalajara/);
  assert.match(html, /\/css\/site\.css\?v=[0-9a-f]{8}/);
});

test('SEO: robots.txt, sitemap.xml y llms.txt', async () => {
  const robots = await (await fetch(base + '/robots.txt')).text();
  assert.match(robots, new RegExp(`Sitemap: ${base}/sitemap.xml`));
  assert.match(robots, /Disallow: \/admin/);
  const sm = await fetch(base + '/sitemap.xml');
  assert.match(sm.headers.get('content-type'), /xml/);
  assert.match(await sm.text(), new RegExp(`<loc>${base}/</loc>`));
  assert.match(await (await fetch(base + '/llms.txt')).text(), /Rubén Darío/);
});

test('SEO: 404 sin indexar', async () => {
  const res = await fetch(base + '/no-existe');
  assert.equal(res.status, 404);
  assert.equal(res.headers.get('x-robots-tag'), 'noindex');
  const html = await res.text();
  assert.match(html, /content="noindex, follow"/);
  assert.doesNotMatch(html, /rel="canonical"/);
});
