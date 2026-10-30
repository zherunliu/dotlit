/** Reproducible, cached preparation. Runtime never contacts a map service. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import mapshaper from 'mapshaper';
import { geoArea, geoCentroid, geoContains, geoBounds } from 'd3-geo';

const cache = path.resolve('.cache/maps');
await fs.mkdir(cache, { recursive: true });
const urls = [];
async function get(code) {
  const url = `https://geo.datav.aliyun.com/areas_v3/bound/${code}_full.json`;
  const file = path.join(cache, `${code}.json`);
  urls.push(url);
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    /* fetch once */
  }
  execFileSync('curl', [
    '-L',
    '--fail',
    '--silent',
    '--show-error',
    '--retry',
    '2',
    '--max-time',
    '50',
    url,
    '-o',
    file,
  ]);
  return JSON.parse(await fs.readFile(file, 'utf8'));
}
const fc = (features) => ({ type: 'FeatureCollection', features });
const country = await get('100000');
const all = country.features.filter(
  (f) => typeof f.properties.adcode === 'number',
);
const shortNames = [
  '北京',
  '天津',
  '河北',
  '山西',
  '内蒙古',
  '辽宁',
  '吉林',
  '黑龙江',
  '上海',
  '江苏',
  '浙江',
  '安徽',
  '福建',
  '江西',
  '山东',
  '河南',
  '湖北',
  '湖南',
  '广东',
  '广西',
  '海南',
  '重庆',
  '四川',
  '贵州',
  '云南',
  '西藏',
  '陕西',
  '甘肃',
  '青海',
  '宁夏',
  '新疆',
  '台湾',
  '香港',
  '澳门',
];
function normalize(feature, id, name, provinceId, shortName) {
  feature = structuredClone(feature);
  if (geoArea(feature) > Math.PI * 2) {
    if (feature.geometry.type === 'Polygon')
      feature.geometry.coordinates.forEach((r) => r.reverse());
    if (feature.geometry.type === 'MultiPolygon')
      feature.geometry.coordinates.forEach((p) =>
        p.forEach((r) => r.reverse()),
      );
  }
  const center =
    feature.properties.center ??
    feature.properties.centroid ??
    geoCentroid(feature);
  return {
    type: 'Feature',
    properties: {
      id,
      name,
      shortName: shortName ?? name.replace(/市$/, ''),
      provinceId,
      center,
    },
    geometry: structuredClone(feature.geometry),
  };
}
const provinces = all.map((f, i) =>
  normalize(
    f,
    `cn:${f.properties.adcode}`,
    f.properties.name,
    `cn:${f.properties.adcode}`,
    shortNames[i],
  ),
);
provinces.forEach((p, i) => {
  p.properties.center = all[i].properties.centroid ?? p.properties.center;
});
const regions = [];
for (const p of all) {
  const code = p.properties.adcode;
  const provinceId = `cn:${code}`;
  if ([110000, 120000, 310000, 500000, 810000, 820000].includes(code)) {
    regions.push(normalize(p, provinceId, p.properties.name, provinceId));
  } else if (code !== 710000) {
    const children = await get(String(code));
    for (const city of children.features) {
      if (!city.properties.name || typeof city.properties.adcode !== 'number')
        continue;
      // DataV already exposes province-administered county units individually.
      regions.push(
        normalize(
          city,
          `cn:${city.properties.adcode}`,
          city.properties.name,
          provinceId,
        ),
      );
    }
    console.log(p.properties.name, children.features.length);
  }
}

const twPath = path.join(cache, 'taiwan-topology.json');
const twUrl =
  'https://cdn.jsdelivr.net/npm/taiwan-atlas@2021.9.20/counties-10t.json';
try {
  await fs.access(twPath);
} catch {
  execFileSync('curl', [
    '-L',
    '--fail',
    '--silent',
    '--show-error',
    '--max-time',
    '60',
    twUrl,
    '-o',
    twPath,
  ]);
}
const licensePath = path.join(cache, 'taiwan-LICENSE');
try {
  await fs.access(licensePath);
} catch {
  execFileSync('curl', [
    '-L',
    '--fail',
    '--silent',
    '--show-error',
    '--max-time',
    '60',
    'https://cdn.jsdelivr.net/npm/taiwan-atlas@2021.9.20/LICENSE',
    '-o',
    licensePath,
  ]);
}
const twOutput = await mapshaper.applyCommands(
  `-i ${twPath} -target counties -o format=geojson`,
);
const tw = JSON.parse(Object.values(twOutput)[0]);
const simplifiedNames = {
  臺北市: '台北市',
  新北市: '新北市',
  桃園市: '桃园市',
  臺中市: '台中市',
  臺南市: '台南市',
  高雄市: '高雄市',
  基隆市: '基隆市',
  新竹市: '新竹市',
  嘉義市: '嘉义市',
  新竹縣: '新竹县',
  苗栗縣: '苗栗县',
  彰化縣: '彰化县',
  南投縣: '南投县',
  雲林縣: '云林县',
  嘉義縣: '嘉义县',
  屏東縣: '屏东县',
  宜蘭縣: '宜兰县',
  花蓮縣: '花莲县',
  臺東縣: '台东县',
  澎湖縣: '澎湖县',
  金門縣: '金门县',
  連江縣: '连江县',
};
for (const county of tw.features) {
  const c = county.properties;
  // Drop distant maritime outposts from county geometry; preserve main/offshore islands.
  // The maritime inset is supplied separately by the national DataV layer.
  if (county.geometry.type === 'MultiPolygon')
    county.geometry.coordinates = county.geometry.coordinates.filter((poly) =>
      poly[0].some((point) => point[1] > 21),
    );
  regions.push(
    normalize(
      county,
      `tw:${c.COUNTYCODE}`,
      simplifiedNames[c.COUNTYNAME] ??
        (c.COUNTYNAME === '台東縣' ? '台东县' : c.COUNTYNAME),
      'cn:710000',
    ),
  );
}
if (tw.features.length !== 22)
  throw new Error('Expected all 22 Taiwan county/city units');
// The two upstream snapshots both contain Kinmen. Assign each offshore island once,
// to its explicitly recordable county, instead of painting two overlapping cities.
const taiwanRegions = regions.filter((r) => r.properties.id.startsWith('tw:'));
for (const r of regions.filter(
  (r) => r.properties.provinceId === 'cn:350000',
)) {
  const polys =
    r.geometry.type === 'Polygon'
      ? [r.geometry.coordinates]
      : r.geometry.coordinates;
  const kept = polys.filter((coords) => {
    const part = {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: coords },
    };
    return !taiwanRegions.some((t) => geoContains(t, geoCentroid(part)));
  });
  r.geometry = { type: 'MultiPolygon', coordinates: kept };
}
// Archipelago centroids can land in the sea. Prefer a point inside the largest island.
for (const r of taiwanRegions) {
  if (geoContains(r, r.properties.center)) continue;
  const polys =
    r.geometry.type === 'Polygon'
      ? [r.geometry.coordinates]
      : r.geometry.coordinates;
  const parts = polys.map((coords) => ({
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: coords },
  }));
  const largest = parts.sort((a, b) => geoArea(b) - geoArea(a))[0];
  const point = geoCentroid(largest);
  if (geoContains(largest, point)) {
    r.properties.center = point;
    continue;
  }
  const [[x0, y0], [x1, y1]] = geoBounds(largest);
  let nearest = null,
    distance = Infinity;
  for (let x = 0; x < 32; x++)
    for (let y = 0; y < 32; y++) {
      const candidate = [
        x0 + ((x + 0.5) / 32) * (x1 - x0),
        y0 + ((y + 0.5) / 32) * (y1 - y0),
      ];
      const dist = Math.hypot(candidate[0] - point[0], candidate[1] - point[1]);
      if (dist < distance && geoContains(largest, candidate)) {
        nearest = candidate;
        distance = dist;
      }
    }
  if (!nearest) throw new Error(`Unable to place pin for ${r.properties.name}`);
  r.properties.center = nearest;
}
// Derive the Taiwan province outline from exactly the same county dataset, so no seam is hidden under a second silhouette.
const mergedOutput = await mapshaper.applyCommands(
  `-i ${twPath} -target counties -dissolve -o format=geojson`,
);
const mergedData = JSON.parse(Object.values(mergedOutput)[0]);
const merged =
  mergedData.type === 'GeometryCollection'
    ? { geometry: mergedData.geometries[0] }
    : (mergedData.features?.[0] ?? mergedData);
if (merged.geometry.type === 'MultiPolygon')
  merged.geometry.coordinates = merged.geometry.coordinates.filter((poly) =>
    poly[0].some((point) => point[1] > 21),
  );
provinces.find((p) => p.properties.id === 'cn:710000').geometry =
  merged.geometry;

const ids = new Set();
for (const f of regions) {
  if (ids.has(f.properties.id))
    throw new Error(`Duplicate ID ${f.properties.id}`);
  ids.add(f.properties.id);
}
// Topological simplification across all regions keeps their shared edges aligned.
const outputs = await mapshaper.applyCommands(
  '-i regions.geojson -simplify weighted 22% keep-shapes -o format=geojson precision=0.0001',
  { 'regions.geojson': JSON.stringify(fc(regions)) },
);
const simplifiedRegions = JSON.parse(Object.values(outputs)[0]);
// Build province outlines from the simplified city topology, never a second mismatched coastline.
const provinceOut = await mapshaper.applyCommands(
  '-i regions.geojson -dissolve provinceId -o format=geojson precision=0.0001',
  { 'regions.geojson': JSON.stringify(simplifiedRegions) },
);
const dissolved = JSON.parse(Object.values(provinceOut)[0]);
const simplifiedProvinces = fc(
  provinces.map((p) => ({
    ...p,
    geometry: dissolved.features.find(
      (f) => f.properties.provinceId === p.properties.id,
    ).geometry,
  })),
);
// D3 uses clockwise exterior rings; RFC 7946 exports use the opposite winding.
function rewind(feature) {
  if (geoArea(feature) > Math.PI * 2) {
    const g = feature.geometry;
    if (g.type === 'Polygon') g.coordinates.forEach((r) => r.reverse());
    if (g.type === 'MultiPolygon')
      g.coordinates.forEach((p) => p.forEach((r) => r.reverse()));
  }
  return feature;
}
for (const f of [
  ...simplifiedRegions.features,
  ...simplifiedProvinces.features,
])
  rewind(f);
const maritime = fc(
  country.features
    .filter((f) => typeof f.properties.adcode !== 'number')
    .map(rewind),
);
const data = {
  version: 'datav-2021-tw-atlas-2021.9.20-v1',
  generatedAt: new Date().toISOString(),
  provinces: simplifiedProvinces,
  regions: simplifiedRegions,
  maritime,
  sources: [
    {
      name: 'DataV.GeoAtlas',
      url: 'https://datav.aliyun.com/portal/school/atlas/area_selector',
      note: '公开行政区边界；全国文件 Last-Modified 为 2021-06-29。各省为获取时的历史快照，不声明为最新区划。地图数据原始使用条件以 DataV／上游高德说明为准。',
    },
    {
      name: '国土测绘中心 / taiwan-atlas',
      url: 'https://github.com/dkaoster/taiwan-atlas',
      note: 'taiwan-atlas@2021.9.20 的未投影 counties-10t.json；原始来源 https://data.gov.tw/dataset/7442，政府资料开放授权条款第1版；转换代码 MIT。TWD97 经纬度与 WGS84 在本图显示比例下差异可忽略。县市几何中北纬21度以南的远海部分由全国海域附图展示。',
    },
  ],
};
await fs.mkdir('public/data', { recursive: true });
await fs.writeFile('public/data/china.json', JSON.stringify(data));
await fs.copyFile(
  path.join(cache, 'taiwan-LICENSE'),
  'public/data/taiwan-atlas-LICENSE.txt',
);
await fs.writeFile(
  'public/data/sources.json',
  JSON.stringify(
    {
      ...data,
      regions: undefined,
      provinces: undefined,
      maritime: undefined,
      regionCount: regions.length,
      sourceFiles: urls,
      taiwanFile: twUrl,
    },
    null,
    2,
  ),
);
console.log(
  `Prepared ${provinces.length} provinces and ${regions.length} recordable regions.`,
);
