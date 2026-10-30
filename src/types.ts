import type { Feature, FeatureCollection, Geometry } from 'geojson';

export interface RegionProperties {
  id: string;
  name: string;
  shortName: string;
  provinceId: string;
  center: [number, number];
}
export type Region = Feature<Geometry, RegionProperties>;
export interface MapData {
  version: string;
  generatedAt: string;
  provinces: FeatureCollection<Geometry, RegionProperties>;
  regions: FeatureCollection<Geometry, RegionProperties>;
  maritime: FeatureCollection;
  sources: { name: string; url: string; note: string }[];
}
export interface TravelRecord {
  regionId: string;
  visited: boolean;
  rating: number | null;
  planned: boolean;
  note: string;
  updatedAt: string;
}
export type Records = Record<string, TravelRecord>;
export interface Backup {
  format: 'dotlit';
  version: 1;
  mapVersion: string;
  exportedAt: string;
  records: TravelRecord[];
}
