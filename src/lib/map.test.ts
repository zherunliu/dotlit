import { readFileSync } from 'node:fs';
import { geoArea, geoContains } from 'd3-geo';
import { describe, expect, it } from 'vitest';
import type { MapData, Records, WorldData } from '../types';
import attractions from '../data/attractions.json';
import { blankRecord } from './records';
import {
  cleanMapSvg,
  createMapLayout,
  geometryPart,
  isFiniteGeometry,
  mainFeature,
  regionColor,
  RATING_COLORS,
  WORLD_SCOPE,
} from './map';

const data = JSON.parse(
  readFileSync('public/data/china.json', 'utf8'),
) as MapData;
const world = JSON.parse(
  readFileSync('public/data/world.json', 'utf8'),
) as WorldData;

describe('world map and attractions', () => {
  const globalData = { ...data, world };
  it('covers every Chinese province and keeps attractions in their assigned city', () => {
    const cities = new Map(
      data.regions.features.map((r) => [r.properties.id, r]),
    );
    const coveredProvinces = new Set<string>();
    // Keep verified locations where the simplified base map differs.
    const simplifiedBoundary = new Set([
      'Q716232',
      'Q1025339',
      'Q2149114',
      // Taipei Travel places Lungshan Temple in Wanhua, Taipei.
      'Q706761',
    ]);
    for (const attraction of attractions) {
      if (attraction.regionId.startsWith('world:')) continue;
      const city = cities.get(attraction.regionId);
      expect(city, attraction.name).toBeDefined();
      coveredProvinces.add(city!.properties.provinceId);
      if (!simplifiedBoundary.has(attraction.id)) {
        const [longitude, latitude] = attraction.coordinates;
        expect(geoContains(city!, [longitude, latitude]), attraction.name).toBe(
          true,
        );
      }
    }
    expect(coveredProvinces).toEqual(
      new Set(data.provinces.features.map((p) => p.properties.id)),
    );
  });
  it('projects country shapes and every attraction in the corresponding map scope', () => {
    const layout = createMapLayout(globalData, WORLD_SCOPE);
    const regions = new Map(
      [...layout.regions, ...data.regions.features].map((r) => [
        r.properties.id,
        r,
      ]),
    );
    expect(layout.regions.length).toBeGreaterThan(200);
    expect(layout.showInset).toBe(false);
    for (const region of layout.regions) {
      expect(layout.regionPath(region)).toBeTruthy();
      expect(layout.regionPath(region)).not.toMatch(/NaN|Infinity/);
    }
    for (const attraction of attractions) {
      const parent = regions.get(attraction.regionId);
      expect(parent, attraction.name).toBeDefined();
      const [lon, lat] = attraction.coordinates;
      expect(Math.abs(lon)).toBeLessThanOrEqual(180);
      expect(Math.abs(lat)).toBeLessThanOrEqual(90);
      const scope = parent!.properties.provinceId || WORLD_SCOPE;
      expect(
        createMapLayout(globalData, scope)
          .projection([lon, lat])
          ?.every(Number.isFinite),
      ).toBe(true);
    }
  });
  it('exports country fills and existing Chinese city fills without attraction markers', () => {
    const records: Records = Object.fromEntries(
      ['world:FRA', 'cn:110000'].map((id) => [
        id,
        { ...blankRecord(id), visited: true, rating: 5 },
      ]),
    );
    const svg = cleanMapSvg(globalData, records, WORLD_SCOPE);
    for (const id of Object.keys(records)) {
      expect(svg).toMatch(
        new RegExp(`data-region="${id}"[^>]*fill="${RATING_COLORS[4]}"`),
      );
    }
    expect(svg).not.toContain('南海诸岛');
    expect(svg).not.toContain('埃菲尔铁塔');
  });
});
describe('bundled geographical coverage', () => {
  it('has 34 province outlines, unique regional IDs and valid parent references', () => {
    expect(data.provinces.features).toHaveLength(34);
    const parents = new Set(
      data.provinces.features.map((p) => p.properties.id),
    );
    const ids = data.regions.features.map((r) => r.properties.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(391);
    expect(
      data.regions.features.every((r) => parents.has(r.properties.provinceId)),
    ).toBe(true);
  });
  it('represents municipalities and SARs as one recordable region each', () => {
    for (const id of [
      'cn:110000',
      'cn:120000',
      'cn:310000',
      'cn:500000',
      'cn:810000',
      'cn:820000',
    ]) {
      const regions = data.regions.features.filter(
        (r) => r.properties.provinceId === id,
      );
      expect(regions).toHaveLength(1);
      expect(regions[0].properties.id).toBe(id);
    }
  });
  it('includes all 22 Taiwan counties and province-administered county-level units', () => {
    expect(
      data.regions.features.filter(
        (r) => r.properties.provinceId === 'cn:710000',
      ),
    ).toHaveLength(22);
    for (const name of [
      '济源市',
      '仙桃市',
      '石河子市',
      '三沙市',
      '台东县',
      '台北市',
    ]) {
      expect(
        data.regions.features.some((r) => r.properties.name === name),
      ).toBe(true);
    }
  });
  it('keeps every geometry finite, correctly wound and nonempty', () => {
    for (const r of [...data.regions.features, ...data.provinces.features]) {
      expect(isFiniteGeometry(r.geometry), r.properties.name).toBe(true);
      expect(geoArea(r), r.properties.name).toBeGreaterThan(0);
      expect(geoArea(r), r.properties.name).toBeLessThan(Math.PI * 2);
    }
  });
  it('does not double-assign Kinmen to a mainland city', () => {
    const kinmen = data.regions.features.find(
      (r) => r.properties.name === '金门县',
    )!;
    expect(
      data.regions.features
        .filter((r) => r.properties.id.startsWith('cn:'))
        .some((r) => geoContains(r, kinmen.properties.center)),
    ).toBe(false);
  });
  it('preserves a maritime layer and remote island pieces for the inset', () => {
    expect(data.maritime.features.length).toBeGreaterThan(0);
    const sansha = data.regions.features.find(
      (r) => r.properties.name === '三沙市',
    )!;
    expect(geometryPart(sansha, true)).not.toBeNull();
  });
});
describe('map rendering and clean image contract', () => {
  const records: Records = {
    'cn:330100': {
      ...blankRecord('cn:330100'),
      visited: true,
      rating: 5,
      planned: true,
      note: 'This private note must never be in an image',
    },
  };
  it('uses the same rating colors for the map and clean export', () => {
    expect(regionColor('cn:330100', records)).toBe(RATING_COLORS[4]);
    const svg = cleanMapSvg(data, records, null);
    expect(svg).toContain(`data-region="cn:330100"`);
    expect(svg).toContain(`fill="${RATING_COLORS[4]}"`);
  });
  it('exports a fixed high-resolution canvas with province names and no UI or private text', () => {
    const svg = cleanMapSvg(data, records, null);
    expect(svg).toContain('width="3200" height="2080"');
    expect(svg).toContain('浙江');
    expect(svg).toContain('南海诸岛');
    for (const hidden of [
      'This private note',
      '计划去',
      '保存',
      'selected-region',
      'map-pin',
      '<button',
      '<foreignObject',
      '<script',
      '杭州市',
    ])
      expect(svg).not.toContain(hidden);
  });
  it('fits provincial export independently and excludes other provinces', () => {
    const svg = cleanMapSvg(data, records, 'cn:330000');
    expect(svg).toContain('浙江');
    expect(svg).not.toContain('data-region="cn:110000"');
    expect(svg).not.toContain('南海诸岛');
    const country = createMapLayout(data, null),
      province = createMapLayout(data, 'cn:330000');
    expect(province.projection.scale()).toBeGreaterThan(
      country.projection.scale(),
    );
  });
  it('produces finite vector paths for every province focus', () => {
    for (const p of data.provinces.features) {
      const layout = createMapLayout(data, p.properties.id);
      for (const r of layout.regions) {
        const path = layout.path(mainFeature(r));
        expect(path, r.properties.name).toBeTruthy();
        expect(path, r.properties.name).not.toMatch(/NaN|Infinity/);
      }
    }
  });
});
