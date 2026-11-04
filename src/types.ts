import type { Feature, FeatureCollection, Geometry } from 'geojson';

export interface RegionProperties {
  id: string;
  name: string;
  shortName: string;
  provinceId: string;
  center: [number, number];
  searchNames?: string[];
}
export type Region = Feature<Geometry, RegionProperties>;
export interface Attraction {
  id: string;
  name: string;
  aliases: string[];
  regionId: string;
  coordinates: [number, number];
  source: string;
}
export interface WorldData {
  version: string;
  regions: FeatureCollection<Geometry, RegionProperties>;
  source: MapData['sources'][number];
}
export interface MapData {
  version: string;
  generatedAt: string;
  provinces: FeatureCollection<Geometry, RegionProperties>;
  regions: FeatureCollection<Geometry, RegionProperties>;
  maritime: FeatureCollection;
  sources: { name: string; url: string; note: string }[];
  world?: WorldData;
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
