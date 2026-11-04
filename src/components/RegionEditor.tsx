import { useState } from 'react';
import type { Region, TravelRecord } from '../types';
import { blankRecord } from '../lib/records';
import Icon from './Icon';

export default function RegionEditor({
  region,
  province,
  saved,
  onSave,
  onDelete,
  onClose,
}: {
  region: Region;
  province?: string;
  saved?: TravelRecord;
  onSave: (record: TravelRecord) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<TravelRecord>(() =>
    saved ? { ...saved } : blankRecord(region.properties.id),
  );
  const [error, setError] = useState('');
  const [starHover, setStarHover] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dirty =
    JSON.stringify({ ...draft, updatedAt: '' }) !==
    JSON.stringify({
      ...(saved ?? blankRecord(region.properties.id)),
      updatedAt: '',
    });
  const change = (patch: Partial<TravelRecord>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setError('');
  };
  const save = () => {
    if (draft.visited && !draft.rating) {
      setError('请选择 1–5 星评分。');
      return;
    }
    onSave({
      ...draft,
      rating: draft.visited ? draft.rating : null,
      updatedAt: new Date().toISOString(),
    });
  };
  return (
    <div className="region-editor">
      <div className="editor-topline">
        <span>地区记录</span>
        <button
          className="icon-button"
          aria-label="关闭地区记录"
          onClick={() => {
            if (!dirty || window.confirm('有尚未保存的修改，确定离开吗？'))
              onClose();
          }}
        >
          <Icon name="close" size={17} />
        </button>
      </div>
      <div className="editor-place">
        <span>{province}</span>
        <h2>{region.properties.name}</h2>
      </div>
      <label className={`status-toggle ${draft.visited ? 'is-on' : ''}`}>
        <span className="status-icon">
          <Icon name="check" size={20} />
        </span>
        <span>
          <strong>去过</strong>
        </span>
        <input
          type="checkbox"
          checked={draft.visited}
          onChange={(e) =>
            change({
              visited: e.target.checked,
              rating: e.target.checked ? draft.rating : null,
            })
          }
        />
        <span className="switch" aria-hidden="true" />
      </label>
      {draft.visited && (
        <div className="rating-field">
          <div className="field-label">评分</div>
          <div
            className="stars"
            onMouseLeave={() => setStarHover(0)}
            role="group"
            aria-label="星级评分"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={
                  n <= (starHover || draft.rating || 0) ? 'star filled' : 'star'
                }
                aria-label={`${n} 星`}
                aria-pressed={draft.rating === n}
                onMouseEnter={() => setStarHover(n)}
                onFocus={() => setStarHover(n)}
                onBlur={() => setStarHover(0)}
                onClick={() => change({ rating: n })}
              >
                ★
              </button>
            ))}
          </div>
          <p className="rating-description">
            {starHover || draft.rating
              ? `${starHover || draft.rating} 星`
              : '请选择 1–5 星'}
          </p>
        </div>
      )}
      <label
        className={`status-toggle plan-toggle ${draft.planned ? 'is-on' : ''}`}
      >
        <span className="status-icon">
          <Icon name="pin" size={21} />
        </span>
        <span>
          <strong>{draft.visited ? '计划再去' : '计划去'}</strong>
        </span>
        <input
          type="checkbox"
          checked={draft.planned}
          onChange={(e) => change({ planned: e.target.checked })}
        />
        <span className="switch" aria-hidden="true" />
      </label>
      <label className="note-field">
        <span className="field-label">
          备注 <small>选填</small>
        </span>
        <textarea
          value={draft.note}
          maxLength={500}
          onChange={(e) => change({ note: e.target.value })}
          placeholder="添加备注"
          rows={4}
        />
        <span className="character-count">{draft.note.length} / 500</span>
      </label>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button className="button primary save-button" onClick={save}>
        <Icon name="check" size={17} />
        保存
      </button>
      {saved && (
        <div className="delete-area">
          {confirmDelete ? (
            <>
              <span>清除评分、计划和备注？</span>
              <button className="text-button danger" onClick={onDelete}>
                确定清除
              </button>
              <button
                className="text-button"
                onClick={() => setConfirmDelete(false)}
              >
                取消
              </button>
            </>
          ) : (
            <button
              className="text-button muted"
              onClick={() => setConfirmDelete(true)}
            >
              <Icon name="trash" size={13} />
              清除记录
            </button>
          )}
        </div>
      )}
    </div>
  );
}
