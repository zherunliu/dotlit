import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { geoArea } from 'd3-geo';

const version = '5.1.2';
const url = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v${version}/geojson/ne_50m_admin_0_countries.geojson`;
const cache = '.cache/maps/ne_50m_admin_0_countries.geojson';
let source;
try {
  source = JSON.parse(await readFile(cache, 'utf8'));
} catch {
  await mkdir('.cache/maps', { recursive: true });
  source = JSON.parse(
    execFileSync('curl', ['-fLsS', '--compressed', '--max-time', '120', url], {
      maxBuffer: 12 * 1024 * 1024,
    }),
  );
  await writeFile(cache, JSON.stringify(source));
}

const chinaParts = new Set(['CHN', 'HKG', 'MAC', 'TWN']);
const chinaPolygons = [];
const features = [];
for (const feature of source.features) {
  const p = feature.properties;
  const geometry = feature.geometry;
  const polygons =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  // D3 expects exterior rings clockwise for regions smaller than a hemisphere.
  if (geoArea(feature) > 2 * Math.PI)
    for (const polygon of polygons) for (const ring of polygon) ring.reverse();
  if (chinaParts.has(p.ADM0_A3)) {
    chinaPolygons.push(...polygons);
    if (p.ADM0_A3 !== 'CHN') continue;
  }
  const name = p.NAME_ZH || p.NAME_EN || p.NAME;
  features.push({
    type: 'Feature',
    properties: {
      id: `world:${p.ADM0_A3}`,
      name,
      shortName: name,
      provinceId: '',
      center: [p.LABEL_X, p.LABEL_Y],
      searchNames: [
        ...new Set([p.NAME_EN, p.NAME, p.NAME_ZHT, p.ADM0_A3].filter(Boolean)),
      ],
    },
    geometry,
  });
}
const china = features.find((f) => f.properties.id === 'world:CHN');
if (!china || !chinaPolygons.length)
  throw new Error('Natural Earth source is missing China.');
china.geometry = { type: 'MultiPolygon', coordinates: chinaPolygons };
features.sort((a, b) =>
  a.properties.name.localeCompare(b.properties.name, 'zh-CN'),
);
if (
  features.length < 200 ||
  new Set(features.map((f) => f.properties.id)).size !== features.length ||
  features.some((f) => !f.properties.center.every(Number.isFinite))
)
  throw new Error('Invalid or incomplete world boundary data.');

await writeFile(
  'public/data/world.json',
  JSON.stringify({
    version: `natural-earth-50m-${version}`,
    regions: { type: 'FeatureCollection', features },
    source: {
      name: `Natural Earth 1:50m · v${version}`,
      url: 'https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries-2/',
      note: '公共领域数据。全球边界采用 Natural Earth 默认绘图口径。',
    },
  }) + '\n',
);
console.log(`Prepared ${features.length} world map entries.`);
