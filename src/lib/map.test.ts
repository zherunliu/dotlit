import { readFileSync } from 'node:fs';
import { geoArea, geoContains } from 'd3-geo';
import { describe, expect, it } from 'vitest';
import type { MapData, Records } from '../types';
import { blankRecord } from './records';
import {
  cleanMapSvg,
  createMapLayout,
  geometryPart,
  isFiniteGeometry,
  mainFeature,
  regionColor,
  RATING_COLORS,
} from './map';

const data = JSON.parse(
  readFileSync('public/data/china.json', 'utf8'),
) as MapData;
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
