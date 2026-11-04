import {
  geoConicConformal,
  geoMercator,
  geoNaturalEarth1,
  geoPath,
} from 'd3-geo';
import type { Feature, FeatureCollection, Geometry, Position } from 'geojson';
import type { MapData, Records, Region } from '../types';

export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = 650;
export const WORLD_SCOPE = 'world';
export const CHINA_ENTRY = 'world:CHN';
export const COLORS = {
  paper: '#f3f2e8',
  empty: '#e4e7d9',
  border: '#687b68',
  cityBorder: '#f7f6ee',
  ink: '#375445',
  planned: '#b87b43',
};
export const RATING_COLORS = [
  '#c8b9a6',
  '#c6b882',
  '#a4b58b',
  '#739c80',
  '#3f7963',
];
export function regionColor(id: string, records: Records) {
  const r = records[id];
  return r?.visited && r.rating ? RATING_COLORS[r.rating - 1] : COLORS.empty;
}
export function regionStroke(id: string, records: Records) {
  return records[id]?.visited ? COLORS.cityBorder : '#c5cebb';
}

/** Split only remote maritime pieces; multi-part regions retain their shared ID. */
export function geometryPart(feature: Feature, south: boolean): Feature | null {
  const g = feature.geometry;
  if (g.type !== 'Polygon' && g.type !== 'MultiPolygon')
    return south ? feature : null;
  const polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const selected = polygons.filter(
    (p) => p[0].some((c) => c[1] >= 17) !== south,
  );
  return selected.length
    ? { ...feature, geometry: { type: 'MultiPolygon', coordinates: selected } }
    : null;
}

export function mainFeature<T extends Feature>(f: T): T {
  return (geometryPart(f, false) ?? f) as T;
}
export function createMapLayout(
  data: MapData,
  provinceId: string | null = null,
) {
  const world = provinceId === WORLD_SCOPE ? data.world : undefined;
  const focus = data.provinces.features.find(
    (p) => p.properties.id === provinceId,
  );
  const provinces = world ? [] : focus ? [focus] : data.provinces.features;
  const regions = world
    ? world.regions.features
    : focus
      ? data.regions.features.filter(
          (r) => r.properties.provinceId === provinceId,
        )
      : data.regions.features;
  const collection: FeatureCollection = {
    type: 'FeatureCollection',
    features: provinces.map(mainFeature),
  };
  const projection = world
    ? geoNaturalEarth1().fitExtent(
        [
          [24, 36],
          [MAP_WIDTH - 24, MAP_HEIGHT - 36],
        ],
        { type: 'Sphere' },
      )
    : geoConicConformal()
        .parallels([25, 47])
        .rotate([-105, 0])
        .center([0, 36])
        .fitExtent(
          [
            [45, 32],
            [MAP_WIDTH - 55, MAP_HEIGHT - 48],
          ],
          collection,
        );
  const path = geoPath(projection);
  const showInset = !world && (!provinceId || provinceId === 'cn:460000');
  const insetProjection = geoMercator()
    .center([114, 13])
    .scale(270)
    .translate([904, 514]);
  const insetPath = geoPath(insetProjection);
  return {
    regions,
    provinces,
    projection,
    path,
    isWorld: Boolean(world),
    regionPath: (region: Region) =>
      path(world ? region : mainFeature(region)) ?? '',
    chinaOutline: world?.regions.features.find(
      (r) => r.properties.id === CHINA_ENTRY,
    ),
    showInset,
    insetProjection,
    insetPath,
  };
}

export function chinaFootprints(data: MapData, records: Records) {
  return data.regions.features.filter((r) => records[r.properties.id]?.visited);
}

export function labelPosition(
  region: Region,
  projection: (position: [number, number]) => [number, number] | null,
) {
  const position = projection(region.properties.center);
  if (!position) return null;
  const offset: Record<string, [number, number]> = {
    'cn:110000': [-5, -6],
    'cn:120000': [9, 5],
    'cn:310000': [13, 4],
    'cn:810000': [15, 9],
    'cn:820000': [-13, 13],
  };
  const delta = offset[region.properties.id] ?? [0, 0];
  return [position[0] + delta[0], position[1] + delta[1]] as [number, number];
}

const xml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[c]!,
  );
export function cleanMapSvg(
  data: MapData,
  records: Records,
  provinceId: string | null,
): string {
  const {
    regions,
    provinces,
    projection,
    path,
    showInset,
    insetPath,
    regionPath,
    chinaOutline,
  } = createMapLayout(data, provinceId);
  const paths = regions
    .map(
      (r) =>
        `<path data-region="${xml(r.properties.id)}" d="${regionPath(r)}" fill="${regionColor(r.properties.id, records)}" stroke="${regionStroke(r.properties.id, records)}" stroke-width="0.65"/>`,
    )
    .join('');
  const boundaries = provinces
    .map(
      (p) =>
        `<path d="${path(mainFeature(p)) ?? ''}" fill="none" stroke="${COLORS.border}" stroke-width="1.05"/>`,
    )
    .join('');
  const labels = provinces
    .map((p) => {
      const center = provinceId
        ? path.centroid(mainFeature(p))
        : labelPosition(p, projection);
      return center
        ? `<text x="${center[0]}" y="${center[1]}" text-anchor="middle" fill="${COLORS.ink}" font-size="${provinceId ? 19 : 12}" font-family="serif" stroke="${COLORS.paper}" stroke-width="2.4" paint-order="stroke">${xml(p.properties.shortName)}</text>`
        : '';
    })
    .join('');
  let inset = '';
  const detail = chinaOutline
    ? `<defs><clipPath id="china-detail"><path d="${regionPath(chinaOutline)}"/></clipPath></defs><g clip-path="url(#china-detail)">${chinaFootprints(
        data,
        records,
      )
        .map(
          (r) =>
            `<path data-region="${xml(r.properties.id)}" d="${path(mainFeature(r)) ?? ''}" fill="${regionColor(r.properties.id, records)}"/>`,
        )
        .join('')}</g>`
    : '';
  if (showInset) {
    const pieces = data.regions.features
      .map((f) => ({ feature: geometryPart(f, true), id: f.properties.id }))
      .filter((p) => p.feature);
    inset = `<defs><clipPath id="sea-clip"><rect x="846" y="454" width="114" height="158"/></clipPath></defs><rect x="846" y="454" width="114" height="158" rx="2" fill="${COLORS.paper}" stroke="#adb7a4" stroke-width="0.8"/><g clip-path="url(#sea-clip)">${pieces.map((p) => `<path d="${insetPath(p.feature!) ?? ''}" fill="${regionColor(p.id, records)}" stroke="${COLORS.border}" stroke-width="0.5"/>`).join('')}${data.maritime.features.map((f) => `<path d="${insetPath(f) ?? ''}" fill="${COLORS.border}"/>`).join('')}</g><text x="903" y="602" text-anchor="middle" fill="${COLORS.ink}" font-family="serif" font-size="10">南海诸岛</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="3200" height="2080" viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}"><rect width="1000" height="650" fill="${COLORS.paper}"/>${paths}${detail}${boundaries}${labels}${inset}</svg>`;
}

export async function renderMapPng(svg: string): Promise<Blob> {
  await document.fonts.ready;
  const url = URL.createObjectURL(
    new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
  );
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('地图图片生成失败，请重试。'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 3200;
    canvas.height = 2080;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前浏览器无法生成 PNG 图片。');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('PNG 导出失败。'))),
        'image/png',
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function isFiniteGeometry(geometry: Geometry): boolean {
  if (geometry.type === 'GeometryCollection')
    return geometry.geometries.every(isFiniteGeometry);
  const walk = (coordinates: unknown): boolean =>
    Array.isArray(coordinates) &&
    coordinates.length > 0 &&
    (typeof coordinates[0] === 'number'
      ? coordinates.every((v) => typeof v === 'number' && Number.isFinite(v))
      : coordinates.every(walk));
  return walk(geometry.coordinates as Position);
}
