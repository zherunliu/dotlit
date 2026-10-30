import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Backup, MapData, Records, Region, TravelRecord } from './types';
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
import { cleanMapSvg, RATING_COLORS, renderMapPng } from './lib/map';
import { downloadBlob, localDate } from './lib/download';
import Icon from './components/Icon';
import TravelMap from './components/TravelMap';
import RegionEditor from './components/RegionEditor';
import Modal from './components/Modal';

type Filter = 'all' | 'visited' | 'planned';
type Dialog = 'export' | 'import' | 'about' | null;
const filterNames: Record<Filter, string> = {
  all: '全部城市',
  visited: '我的足迹',
  planned: '旅行计划',
};
const normalizeQuery = (text: string) => text.trim().replace(/臺/g, '台');

export default function App() {
  const [data, setData] = useState<MapData | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}data/china.json`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error('地图文件加载失败');
        return response.json();
      })
      .then(setData)
      .catch((err) => {
        if (err.name !== 'AbortError')
          setError('地图暂时无法加载，请刷新重试。');
      });
    return () => controller.abort();
  }, []);
  if (!data)
    return (
      <div className="loading-screen">
        <Brand />
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

function Brand() {
  return (
    <div className="brand">
      <div className="brand-symbol" aria-hidden="true">
        <svg viewBox="0 0 32 38">
          <path d="m16 3 8 14-8 18-8-18Z" fill="currentColor" />
          <path d="m16 3 8 14h-8Z" fill="#b6c99e" />
          <circle cx="16" cy="18" r="3" fill="#f7f5ec" />
        </svg>
      </div>
      <span className="brand-name">行迹</span>
      <span className="brand-english">dotlit</span>
    </div>
  );
}

function Workspace({ data }: { data: MapData }) {
  const regionIds = useMemo(
    () => new Set(data.regions.features.map((r) => r.properties.id)),
    [data],
  );
  const [initial] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return {
        records: raw
          ? indexRecords(parseBackup(raw, regionIds, data.version).records)
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
  const [provinceId, setProvinceId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [pendingBackup, setPendingBackup] = useState<Backup | null>(null);
  const [toast, setToast] = useState('');
  const [exportProvince, setExportProvince] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [mobileList, setMobileList] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const stats = travelStats(records, regionIds.size);
  const selected = data.regions.features.find(
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
    return data.regions.features.filter(
      (r) =>
        (!provinceId || r.properties.provinceId === provinceId) &&
        (!q ||
          normalizeQuery(r.properties.name).includes(q) ||
          normalizeQuery(provinceNames[r.properties.provinceId]).includes(q)) &&
        (filter === 'all' || Boolean(records[r.properties.id]?.[filter])),
    );
  }, [data, provinceId, query, filter, records, provinceNames]);
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
        JSON.stringify(makeBackup(next, data.version)),
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
    setSelectedId(region.properties.id);
    setMobileList(false);
  }
  function focusProvince(id: string | null) {
    setProvinceId(id);
    setSelectedId(null);
    setQuery('');
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
      new Blob([JSON.stringify(makeBackup(records, data.version), null, 2)], {
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
      const backup = parseBackup(await file.text(), regionIds, data.version);
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
      const scope = exportProvince && provinceId ? provinceId : null;
      const blob = await renderMapPng(cleanMapSvg(data, records, scope));
      downloadBlob(
        blob,
        `dotlit-${scope ? currentProvince!.properties.shortName : '中国'}-足迹-${localDate()}.png`,
      );
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
        <Brand />
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
              setExportProvince(false);
              setDialog('export');
            }}
          >
            <Icon name="image" size={17} />
            <span>导出地图</span>
          </button>
        </nav>
      </header>
      <main className="workspace">
        <section className="intro">
          <div className="intro-copy">
            <h1>旅行地图</h1>
          </div>
          <div className="travel-stats">
            <div className="stat">
              <span>去过</span>
              <strong>
                {String(stats.visited).padStart(2, '0')}
                <small>座</small>
              </strong>
            </div>
            <div className="stat">
              <span>计划</span>
              <strong>
                {String(stats.planned).padStart(2, '0')}
                <small>座</small>
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
        </section>
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
                className={`country-button ${!provinceId ? 'active' : ''}`}
                onClick={() => focusProvince(null)}
              >
                <Icon name="globe" size={16} />
                {provinceId ? '返回全国' : '全国地图'}
              </button>
              <span className="toolbar-divider" />
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
                setMobileList(true);
              }}
            >
              <Icon name="search" size={16} />
              找城市
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
                </div>
              </div>
            </div>
            <aside
              className={`sidebar ${selected || mobileList ? 'mobile-open' : ''}`}
              aria-label="城市记录与索引"
            >
              {selected ? (
                <RegionEditor
                  key={`${selected.properties.id}-${records[selected.properties.id]?.updatedAt ?? 'new'}`}
                  region={selected}
                  province={provinceNames[selected.properties.provinceId]}
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
                    aria-label="关闭城市列表"
                    onClick={() => setMobileList(false)}
                  >
                    <Icon name="close" />
                  </button>
                  <label className="search-field">
                    <Icon name="search" size={17} />
                    <input
                      aria-label="搜索城市"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="搜索城市"
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
                      {filterNames[filter]}
                    </span>
                    <span>{results.length} 座</span>
                  </div>
                  <div className="city-index">
                    {results.length ? (
                      results.map((r) => {
                        const record = records[r.properties.id];
                        return (
                          <button
                            className="city-row"
                            key={r.properties.id}
                            onClick={() => {
                              if (query && !provinceId)
                                setProvinceId(r.properties.provinceId);
                              selectRegion(r);
                            }}
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
                                {provinceNames[r.properties.provinceId]}
                              </small>
                            </span>
                            <span className="city-row-meta">
                              {record?.visited && (
                                <span className="row-rating">
                                  {record.rating}
                                  <span>★</span>
                                </span>
                              )}
                              {record?.planned && <Icon name="pin" size={14} />}
                              <Icon name="chevron" size={13} />
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <div className="empty-results">
                        <Icon
                          name={filter === 'planned' ? 'pin' : 'search'}
                          size={28}
                        />
                        <h3>
                          {query
                            ? '未找到城市'
                            : filter === 'visited'
                              ? '暂无去过的城市'
                              : '暂无计划'}
                        </h3>
                        <p>
                          {query
                            ? '尝试其他名称或返回全国搜索。'
                            : '选择城市后添加记录。'}
                        </p>
                        <button
                          className="text-button"
                          onClick={() => {
                            setFilter('all');
                            setQuery('');
                          }}
                        >
                          查看全部城市
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
          <p className="modal-description">
            保留边界、星级颜色和省名，不含图钉及操作界面。
          </p>
          <div className="export-preview" aria-hidden="true">
            <div
              dangerouslySetInnerHTML={{
                __html: cleanMapSvg(
                  data,
                  records,
                  exportProvince ? provinceId : null,
                ),
              }}
            />
            <span>高清 PNG · 3200 × 2080</span>
          </div>
          <fieldset className="export-options">
            <legend>导出范围</legend>
            <label>
              <input
                type="radio"
                name="export-scope"
                checked={!exportProvince}
                onChange={() => setExportProvince(false)}
              />
              完整中国地图
            </label>
            <label className={!provinceId ? 'disabled' : ''}>
              <input
                type="radio"
                name="export-scope"
                checked={exportProvince}
                disabled={!provinceId}
                onChange={() => setExportProvince(true)}
              />
              {currentProvince
                ? currentProvince.properties.name
                : '当前省份（请先聚焦省份）'}
            </label>
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
            文件已通过校验。确认后将整体替换当前记录。
          </p>
          <div className="import-summary">
            <span>
              备份记录<strong>{pendingBackup.records.length} 座</strong>
            </span>
            <span>
              当前记录<strong>{Object.keys(records).length} 座</strong>
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
                  records: indexRecords(pendingBackup.records),
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
            <h3>记录口径</h3>
            <p>
              共 {regionIds.size}{' '}
              个记录区域。地级行政区各一块，直辖市与港澳各一块，省直辖县市单独记录，台湾按
              22 个市县记录。探索比例按区域数量计算，不按面积计算。
            </p>
            <h3>地图来源与版本</h3>
            {data.sources.map((source) => (
              <p key={source.name}>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.name} ↗
                </a>
                <br />
                {source.note}
              </p>
            ))}
            <p className="map-version">
              地图版本：{data.version}
              <br />
              用于个人足迹可视化，不用于测量或导航。
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}
