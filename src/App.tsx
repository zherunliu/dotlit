import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type {
  Backup,
  MapData,
  Records,
  Region,
  TravelRecord,
  WorldData,
  Attraction,
} from './types';
import {
  indexRecords,
  makeBackup,
  parseBackup,
  recordsReducer,
  STORAGE_KEY,
  travelStats,
  validateRecord,
  type RecordAction,
} from './lib/records';
import {
  CHINA_ENTRY,
  cleanMapSvg,
  RATING_COLORS,
  renderMapPng,
  WORLD_SCOPE,
} from './lib/map';
import attractionsData from './data/attractions.json';
import { downloadBlob, localDate } from './lib/download';
import Icon from './components/Icon';
import TravelMap from './components/TravelMap';
import RegionEditor from './components/RegionEditor';
import Modal from './components/Modal';

type Filter = 'all' | 'visited' | 'planned';
type Dialog = 'export' | 'import' | 'about' | null;
const attractions = attractionsData as Attraction[];
const filterNames: Record<Exclude<Filter, 'all'>, string> = {
  visited: '我的足迹',
  planned: '旅行计划',
};
const normalizeQuery = (text: string) =>
  text
    .trim()
    .replace(/臺/g, '台')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

export default function App() {
  const [data, setData] = useState<(MapData & { world: WorldData }) | null>(
    null,
  );
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    async function loadMap<T>(name: string): Promise<T> {
      const response = await fetch(
        `${import.meta.env.BASE_URL}data/${name}.json`,
        { signal: controller.signal },
      );
      if (!response.ok) throw new Error('地图文件加载失败');
      return response.json();
    }
    Promise.all([loadMap<MapData>('china'), loadMap<WorldData>('world')])
      .then(([china, world]) => setData({ ...china, world }))
      .catch((err) => {
        if (err.name !== 'AbortError')
          setError('地图暂时无法加载，请刷新重试。');
      });
    return () => controller.abort();
  }, []);
  if (!data)
    return (
      <div className="loading-screen">
        <p role="status">{error || '加载地图…'}</p>
        {error && (
          <button className="button" onClick={() => location.reload()}>
            重新加载
          </button>
        )}
      </div>
    );
  return <Workspace data={data} />;
}

function Workspace({ data }: { data: MapData & { world: WorldData } }) {
  const worldRegions = data.world.regions.features;
  const chinaRegions = data.regions.features;
  const mapVersion = `${data.version}+${data.world.version}`;
  const legacy = useMemo(
    () => ({
      version: data.version,
      regionIds: new Set(chinaRegions.map((r) => r.properties.id)),
    }),
    [data.version, chinaRegions],
  );
  const regionIds = useMemo(
    () =>
      new Set([
        ...legacy.regionIds,
        ...worldRegions
          .map((r) => r.properties.id)
          .filter((id) => id !== CHINA_ENTRY),
      ]),
    [legacy, worldRegions],
  );
  const [initial] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return {
        records: raw
          ? indexRecords(
              parseBackup(raw, regionIds, mapVersion, legacy).records,
            )
          : {},
        error: '',
      };
    } catch {
      return {
        records: {},
        error:
          '本地记录暂时无法读取，原有内容未被覆盖。请检查浏览器存储或导入备份。',
      };
    }
  });
  const [records, dispatch] = useReducer(
    recordsReducer,
    initial.records as Records,
  );
  const [storageError, setStorageError] = useState(initial.error);
  const [provinceId, setProvinceId] = useState<string | null>(WORLD_SCOPE);
  const isWorld = provinceId === WORLD_SCOPE;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedAttraction, setSelectedAttraction] =
    useState<Attraction | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [pendingBackup, setPendingBackup] = useState<Backup | null>(null);
  const [toast, setToast] = useState('');
  const [exportScope, setExportScope] = useState<string | null>(WORLD_SCOPE);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [mobileList, setMobileList] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const stats = travelStats(records, regionIds.size);
  const selected = [...worldRegions, ...chinaRegions].find(
    (r) => r.properties.id === selectedId,
  );
  const currentProvince = data.provinces.features.find(
    (p) => p.properties.id === provinceId,
  );
  const provinceNames = useMemo(
    () =>
      Object.fromEntries(
        data.provinces.features.map((p) => [
          p.properties.id,
          p.properties.name,
        ]),
      ),
    [data],
  );
  const results = useMemo(() => {
    const q = normalizeQuery(query);
    const places = isWorld
      ? q || filter !== 'all'
        ? [...worldRegions, ...chinaRegions]
        : worldRegions
      : chinaRegions.filter(
          (r) => !provinceId || r.properties.provinceId === provinceId,
        );
    return places.filter(({ properties: place }) => {
      const names = [
        place.name,
        ...(place.searchNames ?? []),
        provinceNames[place.provinceId] ?? '',
      ];
      return (
        (!q || names.some((name) => normalizeQuery(name).includes(q))) &&
        (filter === 'all' || Boolean(records[place.id]?.[filter]))
      );
    });
  }, [
    chinaRegions,
    worldRegions,
    isWorld,
    provinceId,
    query,
    filter,
    records,
    provinceNames,
  ]);
  const isLegacyImport = pendingBackup?.mapVersion === legacy.version;
  const placesById = useMemo(
    () =>
      new Map(
        [...worldRegions, ...chinaRegions].map((r) => [r.properties.id, r]),
      ),
    [worldRegions, chinaRegions],
  );
  const attractionQuery = normalizeQuery(query);
  function attractionLocation(attraction: Attraction) {
    const place = placesById.get(attraction.regionId)?.properties;
    if (!place) return '';
    const province = provinceNames[place.provinceId];
    return province && province !== place.name
      ? `${province} · ${place.name}`
      : place.name;
  }
  const attractionResults = attractionQuery
    ? attractions.filter((attraction) => {
        const names = [
          attraction.name,
          ...attraction.aliases,
          attractionLocation(attraction),
        ];
        return names.some((name) =>
          normalizeQuery(name).includes(attractionQuery),
        );
      })
    : [];
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(''), 5500);
    return () => clearTimeout(id);
  }, [toast]);
  function commit(action: RecordAction) {
    const next = recordsReducer(records, action);
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(makeBackup(next, mapVersion)),
      );
      setStorageError('');
    } catch {
      setStorageError(
        '浏览器未能保存记录。当前修改仍在页面中，请立即导出数据备份。',
      );
    }
    dispatch(action);
  }
  function selectRegion(region: Region) {
    if (region.properties.id === CHINA_ENTRY) {
      focusProvince(null);
      setMobileList(false);
      return;
    }
    if (
      legacy.regionIds.has(region.properties.id) &&
      (isWorld || (query && !provinceId))
    ) {
      setProvinceId(region.properties.provinceId);
      setQuery('');
    }
    setSelectedAttraction(null);
    setSelectedId(region.properties.id);
    setMobileList(false);
  }
  function focusProvince(id: string | null) {
    setProvinceId(id);
    setSelectedId(null);
    setSelectedAttraction(null);
    setQuery('');
  }
  function focusAttraction(attraction: Attraction) {
    const place = placesById.get(attraction.regionId);
    if (!place) return;
    setProvinceId(place.properties.provinceId || WORLD_SCOPE);
    setSelectedId(null);
    setSelectedAttraction({ ...attraction });
    setMobileList(false);
  }
  function saveRecord(record: TravelRecord) {
    try {
      validateRecord(record, regionIds);
      commit({ type: 'save', record });
      setToast('已保存');
    } catch (error) {
      setToast((error as Error).message);
    }
  }
  function exportData() {
    downloadBlob(
      new Blob([JSON.stringify(makeBackup(records, mapVersion), null, 2)], {
        type: 'application/json;charset=utf-8',
      }),
      `dotlit-旅行备份-${localDate()}.json`,
    );
    setToast('已导出数据');
  }
  async function importFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new Error('文件超过 5 MB，请选择 Dotlit 导出的 JSON 备份。');
      const backup = parseBackup(
        await file.text(),
        regionIds,
        mapVersion,
        legacy,
      );
      setPendingBackup(backup);
      setDialog('import');
    } catch (error) {
      setToast((error as Error).message);
    }
  }
  async function exportImage() {
    setExporting(true);
    setExportError('');
    try {
      const name =
        exportScope === WORLD_SCOPE
          ? '全球'
          : exportScope
            ? provinceNames[exportScope]
            : '中国';
      const blob = await renderMapPng(cleanMapSvg(data, records, exportScope));
      downloadBlob(blob, `dotlit-${name}-足迹-${localDate()}.png`);
      setDialog(null);
      setToast('已导出图片');
    } catch (error) {
      setExportError((error as Error).message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <header className="site-header">
        <div className="travel-stats">
          <div className="stat">
            <span>去过</span>
            <strong>
              {String(stats.visited).padStart(2, '0')}
              <small>处</small>
            </strong>
          </div>
          <div className="stat">
            <span>计划</span>
            <strong>
              {String(stats.planned).padStart(2, '0')}
              <small>处</small>
            </strong>
          </div>
          <div className="stat progress-stat">
            <span>探索进度</span>
            <strong>
              {stats.percent.toFixed(1)}
              <small>%</small>
            </strong>
            <div className="progress-track">
              <div style={{ width: `${stats.percent}%` }} />
            </div>
          </div>
        </div>
        <nav className="header-actions" aria-label="备份与导出">
          <button
            className="button quiet"
            aria-label="导入数据"
            onClick={() => inputRef.current?.click()}
          >
            <Icon name="upload" size={16} />
            <span>导入数据</span>
          </button>
          <button
            className="button quiet"
            aria-label="导出数据"
            onClick={exportData}
          >
            <Icon name="download" size={16} />
            <span>导出数据</span>
          </button>
          <span className="action-divider" />
          <button
            className="button primary"
            onClick={() => {
              setExportError('');
              setExportScope(provinceId);
              setDialog('export');
            }}
          >
            <Icon name="image" size={17} />
            <span>导出地图</span>
          </button>
        </nav>
      </header>
      <main className="workspace">
        {storageError && (
          <div className="storage-warning" role="alert">
            <Icon name="info" />
            <span>{storageError}</span>
            <button className="text-button" onClick={exportData}>
              导出当前数据
            </button>
          </div>
        )}
        <section className="atlas-card" aria-label="旅行地图工作区">
          <div className="atlas-toolbar">
            <div className="location-tools">
              <button
                className={`country-button ${isWorld ? 'active' : ''}`}
                onClick={() => focusProvince(WORLD_SCOPE)}
              >
                <Icon name="globe" size={16} />
                世界地图
              </button>
              <button
                className={`country-button ${provinceId === null ? 'active' : ''}`}
                onClick={() => focusProvince(null)}
              >
                中国地图
              </button>
              {!isWorld && (
                <select
                  aria-label="选择省份聚焦"
                  value={provinceId ?? ''}
                  onChange={(e) => focusProvince(e.target.value || null)}
                >
                  <option value="">选择省份</option>
                  {data.provinces.features.map((p) => (
                    <option key={p.properties.id} value={p.properties.id}>
                      {p.properties.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="filter-tabs" role="group" aria-label="筛选旅行状态">
              {(['all', 'visited', 'planned'] as Filter[]).map((f) => (
                <button
                  key={f}
                  className={filter === f ? 'active' : ''}
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? '全部' : f === 'visited' ? '去过' : '想去'}
                  {f === 'planned' && <span className="plan-tab-dot" />}
                </button>
              ))}
            </div>
            <button
              className="mobile-list-button button quiet"
              onClick={() => {
                setSelectedId(null);
                setSelectedAttraction(null);
                setMobileList(true);
              }}
            >
              <Icon name="search" size={16} />
              搜索
            </button>
          </div>
          <div className="atlas-body">
            <div className="map-column">
              <TravelMap
                data={data}
                records={records}
                provinceId={provinceId}
                selectedId={selectedId}
                onSelect={selectRegion}
                onProvince={focusProvince}
                attractions={attractions.filter(
                  (attraction) =>
                    isWorld ||
                    (legacy.regionIds.has(attraction.regionId) &&
                      (!provinceId ||
                        placesById.get(attraction.regionId)?.properties
                          .provinceId === provinceId)),
                )}
                focusedAttraction={selectedAttraction}
                onAttraction={focusAttraction}
                filter={filter}
              />
              <div className="map-legend">
                <div className="legend-title">评分</div>
                <div className="legend-items">
                  {RATING_COLORS.map((color, i) => (
                    <div
                      className="legend-item"
                      key={color}
                      title={`${i + 1} 星`}
                    >
                      <span
                        className="legend-swatch"
                        style={{ background: color }}
                      />
                      <span>
                        {i + 1}
                        <span className="tiny-star">★</span>
                      </span>
                    </div>
                  ))}
                  <span className="legend-separator" />
                  <div className="legend-plan">
                    <Icon name="pin" size={15} />
                    <span>计划去</span>
                  </div>
                  <div className="legend-attraction">
                    <span aria-hidden="true">◆</span> 景点
                  </div>
                </div>
              </div>
            </div>
            <aside
              className={`sidebar ${selected || selectedAttraction || mobileList ? 'mobile-open' : ''} ${selectedAttraction ? 'attraction-detail' : ''}`}
              aria-label="旅行记录与地区索引"
            >
              {selectedAttraction ? (
                <div className="region-editor">
                  <div className="editor-topline">
                    <span>景点</span>
                    <button
                      className="icon-button"
                      aria-label="关闭景点"
                      onClick={() => setSelectedAttraction(null)}
                    >
                      <Icon name="close" size={17} />
                    </button>
                  </div>
                  <div className="editor-place">
                    <span>{attractionLocation(selectedAttraction)}</span>
                    <h2>{selectedAttraction.name}</h2>
                  </div>
                  <button
                    className="button primary"
                    onClick={() => {
                      const place = placesById.get(selectedAttraction.regionId);
                      if (place) selectRegion(place);
                    }}
                  >
                    查看地区记录
                  </button>
                  <a
                    className="attraction-source"
                    href={selectedAttraction.source}
                    target="_blank"
                    rel="noreferrer"
                  >
                    景点资料
                  </a>
                </div>
              ) : selected ? (
                <RegionEditor
                  key={`${selected.properties.id}-${records[selected.properties.id]?.updatedAt ?? 'new'}`}
                  region={selected}
                  province={
                    provinceNames[selected.properties.provinceId] ??
                    selected.properties.searchNames?.[0]
                  }
                  saved={records[selected.properties.id]}
                  onSave={saveRecord}
                  onDelete={() => {
                    commit({
                      type: 'delete',
                      regionId: selected.properties.id,
                    });
                    setToast('已清除记录');
                  }}
                  onClose={() => setSelectedId(null)}
                />
              ) : (
                <>
                  <button
                    className="icon-button mobile-close"
                    aria-label="关闭地区列表"
                    onClick={() => setMobileList(false)}
                  >
                    <Icon name="close" />
                  </button>
                  <label className="search-field">
                    <Icon name="search" size={17} />
                    <input
                      aria-label="搜索地区或景点"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="搜索地区或景点"
                    />
                    {query && (
                      <button
                        className="icon-button"
                        aria-label="清空搜索"
                        onClick={() => setQuery('')}
                      >
                        <Icon name="close" size={14} />
                      </button>
                    )}
                  </label>
                  <div className="city-index-title">
                    <span>
                      {currentProvince
                        ? currentProvince.properties.shortName + ' · '
                        : ''}
                      {query.trim()
                        ? '搜索结果'
                        : filter === 'all'
                          ? isWorld
                            ? '国家和地区'
                            : '城市'
                          : filterNames[filter]}
                    </span>
                    <span>{results.length + attractionResults.length} 处</span>
                  </div>
                  <div className="city-index">
                    {attractionResults.map((attraction) => (
                      <button
                        className="city-row"
                        key={attraction.id}
                        onClick={() => focusAttraction(attraction)}
                      >
                        <span className="attraction-symbol" aria-hidden="true">
                          ◆
                        </span>
                        <span className="city-row-name">
                          {attraction.name}
                          <small>景点 · {attractionLocation(attraction)}</small>
                        </span>
                        <span className="city-row-meta">
                          <Icon name="chevron" size={13} />
                        </span>
                      </button>
                    ))}
                    {results.length
                      ? results.map((r) => {
                          const record = records[r.properties.id];
                          return (
                            <button
                              className="city-row"
                              key={r.properties.id}
                              onClick={() => selectRegion(r)}
                            >
                              <span
                                className={`city-status ${record?.visited ? 'visited' : ''}`}
                                style={
                                  record?.visited
                                    ? {
                                        background:
                                          RATING_COLORS[record.rating! - 1],
                                      }
                                    : undefined
                                }
                              />
                              <span className="city-row-name">
                                {r.properties.name}
                                <small>
                                  {r.properties.id === CHINA_ENTRY
                                    ? '省市地图'
                                    : (provinceNames[r.properties.provinceId] ??
                                      r.properties.searchNames?.[0])}
                                </small>
                              </span>
                              <span className="city-row-meta">
                                {record?.visited && (
                                  <span className="row-rating">
                                    {record.rating}
                                    <span>★</span>
                                  </span>
                                )}
                                {record?.planned && (
                                  <Icon name="pin" size={14} />
                                )}
                                <Icon name="chevron" size={13} />
                              </span>
                            </button>
                          );
                        })
                      : attractionResults.length === 0 && (
                          <div className="empty-results">
                            <Icon
                              name={filter === 'planned' ? 'pin' : 'search'}
                              size={28}
                            />
                            <h3>
                              {query
                                ? '未找到地区或景点'
                                : filter === 'visited'
                                  ? '暂无足迹'
                                  : '暂无计划'}
                            </h3>
                            <p>
                              {query
                                ? '尝试其他名称或切换地图。'
                                : '选择地区后添加记录。'}
                            </p>
                            <button
                              className="text-button"
                              onClick={() => {
                                setFilter('all');
                                setQuery('');
                              }}
                            >
                              查看全部
                              <Icon name="arrow" size={14} />
                            </button>
                          </div>
                        )}
                  </div>
                </>
              )}
            </aside>
          </div>
        </section>
        <footer className="page-footer">
          <span>
            <span className="live-dot" />
            数据保存在当前浏览器
          </span>
          <button className="text-button" onClick={() => setDialog('about')}>
            关于地图与数据
            <Icon name="arrow" size={13} />
          </button>
        </footer>
      </main>
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label="选择旅行备份文件"
        onChange={(e) => {
          void importFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {toast && (
        <div className="toast" role="status">
          <Icon name="info" size={17} />
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="关闭提示"
            onClick={() => setToast('')}
          >
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
      {dialog === 'export' && (
        <Modal
          title="导出图片"
          onClose={() => {
            if (!exporting) setDialog(null);
          }}
        >
          <div className="export-preview" aria-hidden="true">
            <div
              dangerouslySetInnerHTML={{
                __html: cleanMapSvg(data, records, exportScope),
              }}
            />
            <span>高清 PNG · 3200 × 2080</span>
          </div>
          <fieldset className="export-options">
            <legend>导出范围</legend>
            {[
              { id: WORLD_SCOPE, name: '世界地图' },
              { id: null, name: '中国地图' },
              ...(currentProvince
                ? [{ id: provinceId, name: currentProvince.properties.name }]
                : []),
            ].map(({ id, name }) => (
              <label key={id ?? 'china'}>
                <input
                  type="radio"
                  name="export-scope"
                  checked={exportScope === id}
                  onChange={() => setExportScope(id)}
                />
                {name}
              </label>
            ))}
          </fieldset>
          {exportError && (
            <p className="form-error" role="alert">
              {exportError}
            </p>
          )}
          <button
            className="button primary modal-main-action"
            onClick={() => void exportImage()}
            disabled={exporting}
          >
            <Icon name="download" size={17} />
            {exporting ? '生成中…' : '下载 PNG'}
          </button>
        </Modal>
      )}
      {dialog === 'import' && pendingBackup && (
        <Modal title="导入数据" onClose={() => setDialog(null)}>
          <p className="modal-description">
            {isLegacyImport
              ? '旧版备份仅替换中国的记录。'
              : '导入后将替换全部记录。'}
          </p>
          <div className="import-summary">
            <span>
              备份记录<strong>{pendingBackup.records.length} 处</strong>
            </span>
            <span>
              当前记录<strong>{Object.keys(records).length} 处</strong>
            </span>
            <span>
              备份时间
              <strong>
                {new Date(pendingBackup.exportedAt).toLocaleDateString('zh-CN')}
              </strong>
            </span>
          </div>
          <p className="import-warning">替换前可先备份当前数据。</p>
          <button className="button full-width" onClick={exportData}>
            <Icon name="download" size={16} />
            先备份当前数据
          </button>
          <div className="modal-actions">
            <button className="button" onClick={() => setDialog(null)}>
              取消
            </button>
            <button
              className="button primary"
              onClick={() => {
                commit({
                  type: 'replace',
                  records: isLegacyImport
                    ? {
                        ...Object.fromEntries(
                          Object.entries(records).filter(
                            ([id]) => !legacy.regionIds.has(id),
                          ),
                        ),
                        ...indexRecords(pendingBackup.records),
                      }
                    : indexRecords(pendingBackup.records),
                });
                setSelectedId(null);
                setDialog(null);
                setPendingBackup(null);
                setToast('已导入数据');
              }}
            >
              确认替换并导入
            </button>
          </div>
        </Modal>
      )}
      {dialog === 'about' && (
        <Modal title="关于这张地图" onClose={() => setDialog(null)}>
          <p className="modal-description">
            数据仅保存在当前浏览器。清理网站数据会删除记录，可导出 JSON 备份。
          </p>
          <div className="about-details">
            <h3>地图来源与版本</h3>
            <p>
              精选景点坐标来自{' '}
              <a
                href="https://www.wikidata.org/"
                target="_blank"
                rel="noreferrer"
              >
                Wikidata
              </a>
              。
            </p>
            {[data.world.source, ...data.sources].map((source) => (
              <p key={source.name}>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.name} ↗
                </a>
                <br />
                {source.note}
              </p>
            ))}
            <p className="map-version">
              地图版本：{mapVersion}
              <br />
              用于个人足迹可视化，不用于测量或导航。
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}
