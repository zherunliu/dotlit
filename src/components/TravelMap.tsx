import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { select } from 'd3-selection';
import {
  zoom,
  zoomIdentity,
  type ZoomBehavior,
  type ZoomTransform,
} from 'd3-zoom';
import {
  COLORS,
  createMapLayout,
  geometryPart,
  labelPosition,
  mainFeature,
  MAP_HEIGHT,
  MAP_WIDTH,
  regionColor,
  regionStroke,
} from '../lib/map';
import type { MapData, Records, Region } from '../types';
import Icon from './Icon';

export default function TravelMap({
  data,
  records,
  provinceId,
  selectedId,
  onSelect,
  onProvince,
  filter,
}: {
  data: MapData;
  records: Records;
  provinceId: string | null;
  selectedId: string | null;
  onSelect: (region: Region) => void;
  onProvince: (id: string | null) => void;
  filter: 'all' | 'visited' | 'planned';
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const behaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const transformRef = useRef<ZoomTransform>(zoomIdentity);
  const [transform, setTransform] = useState(zoomIdentity);
  const [hovered, setHovered] = useState<string | null>(null);
  const clipId = useId().replace(/:/g, '');
  const layout = useMemo(
    () => createMapLayout(data, provinceId),
    [data, provinceId],
  );
  const cityLabels = useMemo(() => {
    if (!provinceId && transform.k <= 1.8) return [];
    type Box = { x: number; y: number; width: number; height: number };
    const boxes: Box[] = [];
    const result: { region: Region; point: [number, number] }[] = [];
    const fontSize = 9 / Math.sqrt(transform.k);
    for (const p of layout.provinces) {
      const point = provinceId
        ? layout.path.centroid(mainFeature(p))
        : labelPosition(p, layout.projection);
      if (point)
        boxes.push({
          x: point[0] - (p.properties.shortName.length * fontSize) / 2,
          y: point[1] - fontSize,
          width: p.properties.shortName.length * fontSize,
          height: fontSize * 1.5,
        });
    }
    const candidates = layout.regions
      .filter((r) => r.properties.id !== r.properties.provinceId)
      .sort(
        (a, b) =>
          Number(b.properties.id === selectedId) -
            Number(a.properties.id === selectedId) ||
          Number(Boolean(records[b.properties.id]?.visited)) -
            Number(Boolean(records[a.properties.id]?.visited)),
      );
    for (const region of candidates) {
      const point = layout.projection(region.properties.center);
      if (!point) continue;
      if (records[region.properties.id]?.planned) point[1] += 14 / transform.k;
      const screen = transform.apply(point);
      if (
        screen[0] < 12 ||
        screen[0] > MAP_WIDTH - 12 ||
        screen[1] < 20 ||
        screen[1] > MAP_HEIGHT - 15
      )
        continue;
      const width =
        region.properties.shortName.length * fontSize + 6 / transform.k;
      const box = {
        x: point[0] - width / 2,
        y: point[1] - fontSize,
        width,
        height: fontSize + 5 / transform.k,
      };
      if (
        boxes.some(
          (b) =>
            box.x < b.x + b.width &&
            box.x + box.width > b.x &&
            box.y < b.y + b.height &&
            box.y + box.height > b.y,
        )
      )
        continue;
      boxes.push(box);
      result.push({ region, point });
    }
    return result;
  }, [layout, provinceId, transform, selectedId, records]);
  useEffect(() => {
    const svg = svgRef.current!;
    const behavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 12])
      .extent([
        [0, 0],
        [MAP_WIDTH, MAP_HEIGHT],
      ])
      .translateExtent([
        [-120, -100],
        [MAP_WIDTH + 120, MAP_HEIGHT + 100],
      ])
      .on('zoom', (event) => {
        transformRef.current = event.transform;
        setTransform(event.transform);
      });
    behaviorRef.current = behavior;
    select(svg).call(behavior).on('dblclick.zoom', null);
    select(svg).call(behavior.transform, zoomIdentity);
    return () => {
      select(svg).on('.zoom', null);
    };
  }, [provinceId]);
  const scaleBy = (factor: number) => {
    if (behaviorRef.current && svgRef.current)
      select(svgRef.current).call(behaviorRef.current.scaleBy, factor);
  };
  const reset = () => {
    if (behaviorRef.current && svgRef.current)
      select(svgRef.current).call(behaviorRef.current.transform, zoomIdentity);
  };
  const matches = (id: string) =>
    filter === 'all' || Boolean(records[id]?.[filter]);
  const activeHover = data.regions.features.find(
    (r) => r.properties.id === hovered,
  );
  const clickRegion = (r: Region) => {
    setHovered(null);
    onSelect(r);
  };
  return (
    <div className="map-stage">
      <div className="map-caption">
        <span className="live-dot" />
        {provinceId
          ? data.provinces.features.find((p) => p.properties.id === provinceId)
              ?.properties.name
          : '中国 · 市级旅行地图'}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        className="travel-map"
        role="img"
        aria-label="中国旅行足迹地图，可拖拽缩放；也可使用右侧城市列表选择区域"
      >
        <defs>
          <clipPath id={clipId}>
            <rect x="846" y="454" width="114" height="158" />
          </clipPath>
        </defs>
        <g transform={transform.toString()}>
          <g className="city-regions">
            {layout.regions.map((r) => (
              <path
                key={r.properties.id}
                d={layout.path(mainFeature(r)) ?? ''}
                data-region={r.properties.id}
                fill={regionColor(r.properties.id, records)}
                className={`${selectedId === r.properties.id ? 'selected-region' : ''} ${!matches(r.properties.id) ? 'muted-region' : ''}`}
                stroke={regionStroke(r.properties.id, records)}
                strokeWidth={0.65}
                vectorEffect="non-scaling-stroke"
                onClick={() => clickRegion(r)}
                onMouseEnter={() => setHovered(r.properties.id)}
                onMouseLeave={() => setHovered(null)}
              >
                <title>
                  {r.properties.name}
                  {records[r.properties.id]?.visited
                    ? ` · ${records[r.properties.id].rating} 星`
                    : ''}
                </title>
              </path>
            ))}
          </g>
          <g className="province-borders" pointerEvents="none">
            {layout.provinces.map((p) => (
              <path
                key={p.properties.id}
                d={layout.path(mainFeature(p)) ?? ''}
                fill="none"
                stroke={COLORS.border}
                strokeWidth={0.85}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
          <g className="province-labels">
            {layout.provinces.map((p) => {
              const point = provinceId
                ? layout.path.centroid(mainFeature(p))
                : labelPosition(p, layout.projection);
              if (!point) return null;
              return (
                <text
                  key={p.properties.id}
                  x={point[0]}
                  y={point[1]}
                  textAnchor="middle"
                  style={{
                    fontSize: `${(provinceId ? 16 : 11) / Math.sqrt(transform.k)}px`,
                  }}
                  pointerEvents={
                    provinceId && layout.regions.length > 1 ? 'none' : undefined
                  }
                  onClick={() =>
                    provinceId
                      ? onSelect(layout.regions[0])
                      : onProvince(p.properties.id)
                  }
                >
                  {p.properties.shortName}
                </text>
              );
            })}
          </g>
          <g className="city-labels" pointerEvents="none">
            {cityLabels.map(({ region, point }) => (
              <text
                key={region.properties.id}
                x={point[0]}
                y={point[1]}
                textAnchor="middle"
                fontSize={9 / Math.sqrt(transform.k)}
              >
                {region.properties.shortName}
              </text>
            ))}
          </g>
          <g className="plan-pins">
            {layout.regions
              .filter(
                (r) =>
                  records[r.properties.id]?.planned && matches(r.properties.id),
              )
              .map((r) => {
                const point = layout.projection(r.properties.center);
                if (!point) return null;
                return (
                  <g
                    key={r.properties.id}
                    transform={`translate(${point[0]},${point[1]}) scale(${0.85 / transform.k})`}
                    className="map-pin"
                    onClick={() => clickRegion(r)}
                  >
                    <title>{r.properties.name} · 计划去</title>
                    <path
                      d="M0 2C-2-2-8-6-8-12a8 8 0 1 1 16 0C8-6 2-2 0 2Z"
                      fill={COLORS.planned}
                      stroke="#faf7ee"
                      strokeWidth="2"
                    />
                    <circle cy="-12" r="2.7" fill="#faf7ee" />
                  </g>
                );
              })}
          </g>
        </g>
        {layout.showInset && (
          <g className="south-sea-inset">
            <rect
              x="846"
              y="454"
              width="114"
              height="158"
              rx="2"
              fill="#f0f1e7"
              stroke="#b6bdaa"
              strokeWidth="0.7"
            />
            <g clipPath={`url(#${clipId})`}>
              {data.regions.features.map((r) => {
                const piece = geometryPart(r, true);
                return piece ? (
                  <path
                    key={r.properties.id}
                    d={layout.insetPath(piece) ?? ''}
                    fill={regionColor(r.properties.id, records)}
                    stroke={COLORS.border}
                    strokeWidth={0.5}
                    onClick={() => clickRegion(r)}
                  >
                    <title>{r.properties.name}</title>
                  </path>
                ) : null;
              })}
              {data.maritime.features.map((f, i) => (
                <path
                  key={i}
                  d={layout.insetPath(f) ?? ''}
                  fill={COLORS.border}
                />
              ))}
            </g>
            <text x="903" y="602" textAnchor="middle">
              南海诸岛
            </text>
          </g>
        )}
      </svg>
      {activeHover && (
        <div className="map-hover" role="status">
          <strong>{activeHover.properties.name}</strong>
          <span>
            {records[hovered!]?.visited
              ? '★'.repeat(records[hovered!].rating!)
              : records[hovered!]?.planned
                ? '已加入旅行计划'
                : '未标记'}
          </span>
        </div>
      )}
      <div className="map-compass" aria-hidden="true">
        <span>N</span>
        <svg viewBox="0 0 40 48">
          <path d="m20 5 8 30-8-8-8 8Z" fill="#637b68" />
          <path d="m20 5 0 22-8 8Z" fill="#c0c7b2" />
        </svg>
      </div>
      <div className="map-controls">
        <button onClick={() => scaleBy(1.5)} aria-label="放大地图">
          <Icon name="plus" />
        </button>
        <button onClick={() => scaleBy(1 / 1.5)} aria-label="缩小地图">
          <Icon name="minus" />
        </button>
        <span />
        <button onClick={reset} aria-label="重置地图视角">
          <Icon name="reset" size={16} />
        </button>
      </div>
      <div className="map-hint">
        <span>拖动探索</span>
        <span>·</span>
        <span>滚轮缩放</span>
      </div>
    </div>
  );
}
