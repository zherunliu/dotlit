import { describe, expect, it } from 'vitest';
import {
  blankRecord,
  indexRecords,
  makeBackup,
  parseBackup,
  recordsReducer,
  travelStats,
  validateRecord,
} from './records';
import type { TravelRecord } from '../types';

const ids = new Set(['cn:330100', 'cn:110000']);
const mapVersion = 'test-map-v1';
const record: TravelRecord = {
  ...blankRecord('cn:330100'),
  visited: true,
  rating: 5,
  planned: true,
  note: '西湖边，想再去。',
};
const backup = () => makeBackup({ [record.regionId]: record }, mapVersion);
describe('travel state and persistence contract', () => {
  it('keeps a rating and a return-trip plan at the same time', () => {
    const state = recordsReducer({}, { type: 'save', record });
    expect(state[record.regionId]).toMatchObject({
      visited: true,
      rating: 5,
      planned: true,
    });
    expect(travelStats(state, 2)).toEqual({
      visited: 1,
      planned: 1,
      percent: 50,
    });
  });
  it('cancels only the planned pin and preserves the visit and note', () => {
    const state = recordsReducer(
      { [record.regionId]: record },
      { type: 'save', record: { ...record, planned: false } },
    );
    expect(state[record.regionId]).toMatchObject({
      visited: true,
      rating: 5,
      planned: false,
      note: record.note,
    });
  });
  it('clears the rating with the visit while preserving plan and note', () => {
    const state = recordsReducer(
      {},
      { type: 'save', record: { ...record, visited: false } },
    );
    expect(state[record.regionId]).toMatchObject({
      visited: false,
      rating: null,
      planned: true,
      note: record.note,
    });
  });
  it('deletes the entire city without modifying the old state', () => {
    const old = { [record.regionId]: record };
    expect(
      recordsReducer(old, { type: 'delete', regionId: record.regionId }),
    ).toEqual({});
    expect(old[record.regionId]).toBe(record);
  });
  it('round-trips all records through JSON without losing Chinese notes', () => {
    const parsed = parseBackup(JSON.stringify(backup()), ids, mapVersion);
    expect(indexRecords(parsed.records)).toEqual({ [record.regionId]: record });
    expect(parsed).toMatchObject({ format: 'dotlit', version: 1, mapVersion });
  });
  it('accepts an empty backup for a deliberate full replacement', () => {
    expect(
      parseBackup(JSON.stringify(makeBackup({}, mapVersion)), ids, mapVersion)
        .records,
    ).toEqual([]);
  });
  it.each([null, 0, 6, 2.5, '5', true])(
    'rejects an invalid visited rating %s',
    (rating) => {
      expect(() => validateRecord({ ...record, rating }, ids)).toThrow();
    },
  );
  it('rejects a rating on an unvisited region', () => {
    expect(() => validateRecord({ ...record, visited: false }, ids)).toThrow();
  });
  it('accepts 500 characters but rejects longer notes', () => {
    expect(
      validateRecord({ ...record, note: '城'.repeat(500) }, ids).note.length,
    ).toBe(500);
    expect(() =>
      validateRecord({ ...record, note: '城'.repeat(501) }, ids),
    ).toThrow();
  });
  it.each(['invalid json', 'null', '[]', '{"format":"other"}'])(
    'rejects malformed or unrelated input',
    (value) => {
      expect(() => parseBackup(value, ids, mapVersion)).toThrow();
    },
  );
  it('rejects future backup and incompatible map versions', () => {
    expect(() =>
      parseBackup(JSON.stringify({ ...backup(), version: 2 }), ids, mapVersion),
    ).toThrow();
    expect(() =>
      parseBackup(JSON.stringify(backup()), ids, 'different-map'),
    ).toThrow();
  });
  it('rejects unknown IDs, duplicates, invalid dates and nonboolean states', () => {
    for (const records of [
      [{ ...record, regionId: 'cn:unknown' }],
      [record, record],
      [{ ...record, updatedAt: 'not-a-date' }],
      [{ ...record, visited: 'yes' }],
    ])
      expect(() =>
        parseBackup(JSON.stringify({ ...backup(), records }), ids, mapVersion),
      ).toThrow();
  });
  it('validates the entire import before replacing any current records', () => {
    const current = { [record.regionId]: record };
    const broken = {
      ...backup(),
      records: [record, { ...blankRecord('cn:110000'), rating: 7 }],
    };
    expect(() =>
      parseBackup(JSON.stringify(broken), ids, mapVersion),
    ).toThrow();
    expect(current).toEqual({ [record.regionId]: record });
  });
});
