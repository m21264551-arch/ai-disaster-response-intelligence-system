import { useMemo } from "react";
import type { Allocation, Horizon, Hotspot, RevealCell, RevealResponse, RiskCell } from "../lib/types";
import { InfoTip } from "./InfoTip";

interface MapPanelProps {
  bbox: number[];
  horizon: Horizon;
  hotspots: Hotspot[];
  riskCells: RiskCell[];
  allocations: Allocation[];
  reveal: RevealResponse | null;
  revealVisible: boolean;
  selectedH3Id: string | null;
  onSelectCell: (h3Id: string) => void;
}

interface MapBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

const VIEWBOX_WIDTH = 1000;
const VIEWBOX_HEIGHT = 700;
const MAP_LABELS = [
  { name: "Canberra", lat: -35.2809, lon: 149.13 },
  { name: "Goulburn", lat: -34.7516, lon: 149.7206 },
  { name: "Wollongong", lat: -34.4278, lon: 150.8931 },
  { name: "Nowra", lat: -34.8739, lon: 150.6001 },
  { name: "Ulladulla", lat: -35.3591, lon: 150.4727 },
  { name: "Batemans Bay", lat: -35.7082, lon: 150.1744 },
  { name: "Sydney", lat: -33.8688, lon: 151.2093 },
  { name: "Katoomba", lat: -33.7139, lon: 150.3119 },
];

export function MapPanel({
  bbox,
  horizon,
  hotspots,
  riskCells,
  allocations,
  reveal,
  revealVisible,
  selectedH3Id,
  onSelectCell,
}: MapPanelProps) {
  const cellsById = useMemo(() => new Map(riskCells.map((cell) => [cell.h3_id, cell])), [riskCells]);
  const bounds = useMemo(
    () => mapBounds(bbox, riskCells, hotspots, revealVisible ? reveal?.comparison_cells ?? [] : []),
    [bbox, hotspots, reveal, revealVisible, riskCells],
  );
  const project = (lon: number, lat: number) => projectPoint(bounds, lon, lat);
  const topRisk = riskCells[0]?.risk_score ?? 0;
  const comparisonCells = revealVisible ? reveal?.comparison_cells ?? [] : [];

  return (
    <div className="map-panel" role="region" aria-label="Bushfire risk forecast map">
      <div className="map-toolbar">
        <div>
          <span className="label-with-help">
            Risk Forecast
            <InfoTip
              label="Risk Forecast"
              text="Each hexagon is an H3 cell scored for future hotspot risk at the selected horizon."
            />
          </span>
          <strong>{horizon}h horizon</strong>
        </div>
        <div className="map-score">
          <span className="label-with-help">
            Peak risk
            <InfoTip label="Peak risk" text="Highest model probability among the currently visible forecast cells." placement="left" />
          </span>
          <strong>{Math.round(topRisk * 100)}%</strong>
        </div>
      </div>

      <svg className="map-svg" viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} aria-hidden="true">
        <defs>
          <pattern id="lab-grid" width="46" height="46" patternUnits="userSpaceOnUse">
            <path d="M 46 0 L 0 0 0 46" fill="none" stroke="#ececec" strokeWidth="1" />
          </pattern>
        </defs>
        <rect className="map-water" x="0" y="0" width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} />
        <path
          className="map-coast"
          d="M 660 0 C 618 92 662 156 632 226 C 604 292 648 372 620 458 C 598 526 624 604 572 700 L 1000 700 L 1000 0 Z"
        />
        <rect className="map-grid" x="0" y="0" width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} fill="url(#lab-grid)" />

        {MAP_LABELS.map((label) => {
          const point = project(label.lon, label.lat);
          if (!pointWithinView(point)) {
            return null;
          }
          return (
            <text className="map-label" x={point.x} y={point.y} key={label.name}>
              {label.name}
            </text>
          );
        })}

        <g>
          {riskCells.map((cell) => (
            <path
              className={cell.h3_id === selectedH3Id ? "map-cell selected" : "map-cell"}
              d={polygonPath(cell, project)}
              fill={riskFill(cell.risk_score)}
              key={cell.h3_id}
              onClick={() => onSelectCell(cell.h3_id)}
            />
          ))}
        </g>

        {comparisonCells.length > 0 && (
          <g>
            {comparisonCells.map((cell) => (
              <path
                className={`map-cell reveal ${cell.status}`}
                d={revealPolygonPath(cell, project)}
                fill={revealFill(cell.status)}
                key={`${cell.status}-${cell.h3_id}`}
              />
            ))}
          </g>
        )}

        <g>
          {hotspots.map((hotspot, index) => {
            const point = project(hotspot.lon, hotspot.lat);
            return <circle className="map-hotspot" cx={point.x} cy={point.y} r={hotspotRadius(hotspot)} key={index} />;
          })}
        </g>

        <g>
          {allocations.map((allocation) => {
            const cell = cellsById.get(allocation.assigned_h3_id);
            if (!cell) {
              return null;
            }
            const point = project(cell.centroid.lon, cell.centroid.lat);
            return <circle className="map-allocation" cx={point.x} cy={point.y} r="8" key={allocation.resource_id} />;
          })}
        </g>
      </svg>

      {revealVisible && reveal ? (
        <div className="legend reveal-legend">
          <span><i className="hit-key" /> Hit</span>
          <span><i className="miss-key" /> Miss</span>
          <span><i className="false-key" /> False alarm</span>
        </div>
      ) : (
        <div className="legend">
          <span>Lower</span>
          <div className="legend-ramp" aria-hidden="true">
            <i className="ramp-step low" />
            <i className="ramp-step medium-low" />
            <i className="ramp-step medium-high" />
            <i className="ramp-step high" />
          </div>
          <span>Extreme</span>
        </div>
      )}
    </div>
  );
}

function mapBounds(bbox: number[], riskCells: RiskCell[], hotspots: Hotspot[], revealCells: RevealCell[]): MapBounds {
  const seed: MapBounds = bbox.length === 4
    ? { west: bbox[0], south: bbox[1], east: bbox[2], north: bbox[3] }
    : { west: 148.7, south: -37.4, east: 153.8, north: -31.1 };

  const points: Array<{ lat: number; lon: number }> = [
    ...riskCells.map((cell) => cell.centroid),
    ...hotspots.map((hotspot) => ({ lat: hotspot.lat, lon: hotspot.lon })),
    ...revealCells.map((cell) => cell.centroid),
  ];
  if (points.length === 0) {
    return seed;
  }

  const west = Math.min(...points.map((point) => point.lon));
  const east = Math.max(...points.map((point) => point.lon));
  const south = Math.min(...points.map((point) => point.lat));
  const north = Math.max(...points.map((point) => point.lat));
  const lonPad = Math.max(0.45, (east - west) * 0.28);
  const latPad = Math.max(0.45, (north - south) * 0.28);

  return {
    west: west - lonPad,
    east: east + lonPad,
    south: south - latPad,
    north: north + latPad,
  };
}

function projectPoint(bounds: MapBounds, lon: number, lat: number) {
  const x = ((lon - bounds.west) / (bounds.east - bounds.west)) * VIEWBOX_WIDTH;
  const y = ((bounds.north - lat) / (bounds.north - bounds.south)) * VIEWBOX_HEIGHT;
  return { x, y };
}

function pointWithinView(point: { x: number; y: number }) {
  return point.x >= -80 && point.x <= VIEWBOX_WIDTH + 80 && point.y >= -40 && point.y <= VIEWBOX_HEIGHT + 40;
}

function polygonPath(cell: RiskCell, project: (lon: number, lat: number) => { x: number; y: number }) {
  return pathFromCoordinates(firstRing(cell.geometry), project);
}

function revealPolygonPath(cell: RevealCell, project: (lon: number, lat: number) => { x: number; y: number }) {
  return pathFromCoordinates(firstRing(cell.geometry), project);
}

function pathFromCoordinates(
  coordinates: Array<[number, number]>,
  project: (lon: number, lat: number) => { x: number; y: number },
) {
  if (coordinates.length === 0) {
    return "";
  }

  return coordinates
    .map(([lon, lat], index) => {
      const point = project(lon, lat);
      return `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    })
    .join(" ")
    .concat(" Z");
}

function firstRing(geometry: GeoJSON.Geometry): Array<[number, number]> {
  if (!("coordinates" in geometry)) {
    return [];
  }

  const coordinates = geometry.coordinates;
  if (!Array.isArray(coordinates) || !Array.isArray(coordinates[0])) {
    return [];
  }
  return coordinates[0].filter(
    (point): point is [number, number] =>
      Array.isArray(point) && typeof point[0] === "number" && typeof point[1] === "number",
  );
}

function riskFill(risk: number) {
  if (risk >= 0.58) {
    return "#4f4f4f";
  }
  if (risk >= 0.32) {
    return "#9b9b9b";
  }
  if (risk >= 0.12) {
    return "#d4d4d4";
  }
  return "#f2f2f2";
}

function revealFill(status: RevealCell["status"]) {
  if (status === "hit") {
    return "#111111";
  }
  if (status === "miss") {
    return "#6f6f6f";
  }
  return "#d7d7d7";
}

function hotspotRadius(hotspot: Hotspot) {
  return Math.max(4.5, Math.min(11, hotspot.intensity / 11));
}
