import type { Backup, Records, TravelRecord } from '../types';

export const STORAGE_KEY = 'dotlit.travel.v1';
export const blankRecord = (regionId: string): TravelRecord => ({
  regionId,
  visited: false,
  rating: null,
  planned: false,
  note: '',
  updatedAt: new Date().toISOString(),
});

export function validateRecord(
  input: unknown,
  regionIds: Set<string>,
): TravelRecord {
  if (!input || typeof input !== 'object') throw new Error('记录格式不正确。');
  const r = input as Record<string, unknown>;
  if (typeof r.regionId !== 'string' || !regionIds.has(r.regionId))
    throw new Error(`包含未知区域：${String(r.regionId)}。`);
  if (typeof r.visited !== 'boolean' || typeof r.planned !== 'boolean')
    throw new Error('去过或计划状态不正确。');
  if (
    r.visited
      ? !Number.isInteger(r.rating) ||
        Number(r.rating) < 1 ||
        Number(r.rating) > 5
      : r.rating !== null
  )
    throw new Error('去过的城市需要 1–5 整数星；未去过的城市不能有评分。');
  if (typeof r.note !== 'string' || r.note.length > 500)
    throw new Error('备注需要在 500 字以内。');
  if (
    typeof r.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(r.updatedAt))
  )
    throw new Error('记录的更新时间不正确。');
  return {
    regionId: r.regionId,
    visited: r.visited,
    planned: r.planned,
    rating: r.rating as number | null,
    note: r.note,
    updatedAt: r.updatedAt,
  };
}

export function makeBackup(records: Records, mapVersion: string): Backup {
  return {
    format: 'dotlit',
    version: 1,
    mapVersion,
    exportedAt: new Date().toISOString(),
    records: Object.values(records),
  };
}

export function parseBackup(
  text: string,
  regionIds: Set<string>,
  mapVersion: string,
): Backup {
  let b: Record<string, unknown>;
  try {
    b = JSON.parse(text);
  } catch {
    throw new Error('文件不是有效的 JSON，请选择 Dotlit 导出的备份。');
  }
  if (!b || typeof b !== 'object' || b.format !== 'dotlit' || b.version !== 1)
    throw new Error('不支持这个备份格式或版本。');
  if (b.mapVersion !== mapVersion)
    throw new Error('备份的地图数据版本与当前版本不兼容，未导入任何记录。');
  if (
    typeof b.exportedAt !== 'string' ||
    !Number.isFinite(Date.parse(b.exportedAt))
  )
    throw new Error('备份导出时间不正确。');
  if (!Array.isArray(b.records) || b.records.length > regionIds.size)
    throw new Error('备份中的记录列表不正确。');
  const records = b.records.map((r) => validateRecord(r, regionIds));
  if (new Set(records.map((r) => r.regionId)).size !== records.length)
    throw new Error('备份中存在重复区域，请检查文件。');
  return {
    format: 'dotlit',
    version: 1,
    mapVersion,
    exportedAt: b.exportedAt,
    records,
  };
}

export function indexRecords(records: TravelRecord[]): Records {
  return Object.fromEntries(records.map((r) => [r.regionId, r]));
}

export type RecordAction =
  | { type: 'save'; record: TravelRecord }
  | { type: 'delete'; regionId: string }
  | { type: 'replace'; records: Records };
export function recordsReducer(state: Records, action: RecordAction): Records {
  if (action.type === 'replace') return action.records;
  if (action.type === 'delete') {
    const next = { ...state };
    delete next[action.regionId];
    return next;
  }
  const record = {
    ...action.record,
    rating: action.record.visited ? action.record.rating : null,
  };
  return { ...state, [record.regionId]: record };
}

export function travelStats(records: Records, total: number) {
  const rows = Object.values(records);
  const visited = rows.filter((r) => r.visited).length;
  return {
    visited,
    planned: rows.filter((r) => r.planned).length,
    percent: total ? (visited / total) * 100 : 0,
  };
}
