import { useEffect, useMemo, useRef } from "react";
import L, { type LayerGroup, type Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
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

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = "&copy; OpenStreetMap contributors";
const DEFAULT_CENTER: L.LatLngExpression = [-35.35, 150.45];
const DEFAULT_ZOOM = 7;

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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const riskLayerRef = useRef<LayerGroup | null>(null);
  const hotspotLayerRef = useRef<LayerGroup | null>(null);
  const revealLayerRef = useRef<LayerGroup | null>(null);
  const futureHotspotLayerRef = useRef<LayerGroup | null>(null);
  const allocationLayerRef = useRef<LayerGroup | null>(null);
  const lastFitKeyRef = useRef("");
  const onSelectRef = useRef(onSelectCell);

  const cellsById = useMemo(() => new Map(riskCells.map((cell) => [cell.h3_id, cell])), [riskCells]);
  const fitKey = useMemo(() => riskCells.map((cell) => cell.h3_id).join("|"), [riskCells]);
  const topRisk = riskCells[0]?.risk_score ?? 0;
  const comparisonCells = revealVisible ? reveal?.comparison_cells ?? [] : [];

  useEffect(() => {
    onSelectRef.current = onSelectCell;
  }, [onSelectCell]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = L.map(containerRef.current, {
      attributionControl: true,
      scrollWheelZoom: true,
      zoomControl: true,
    }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    L.tileLayer(TILE_URL, {
      attribution: TILE_ATTRIBUTION,
      maxZoom: 18,
    }).addTo(map);

    riskLayerRef.current = L.layerGroup().addTo(map);
    hotspotLayerRef.current = L.layerGroup().addTo(map);
    revealLayerRef.current = L.layerGroup().addTo(map);
    futureHotspotLayerRef.current = L.layerGroup().addTo(map);
    allocationLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    window.requestAnimationFrame(() => map.invalidateSize());

    return () => {
      map.remove();
      mapRef.current = null;
      riskLayerRef.current = null;
      hotspotLayerRef.current = null;
      revealLayerRef.current = null;
      futureHotspotLayerRef.current = null;
      allocationLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layerGroup = riskLayerRef.current;
    if (!map || !layerGroup) {
      return;
    }

    layerGroup.clearLayers();
    const bounds = L.latLngBounds([]);

    for (const cell of riskCells) {
      const selected = cell.h3_id === selectedH3Id;
      const layer = L.geoJSON(cell.geometry, {
        interactive: true,
        style: {
          color: selected ? "#111111" : "#6b5b3e",
          fillColor: riskFill(cell.risk_score),
          fillOpacity: selected ? 0.68 : 0.46,
          opacity: 0.88,
          weight: selected ? 3 : 1,
        },
      });

      layer.on("click", () => onSelectRef.current(cell.h3_id));
      layer.bindTooltip(`${Math.round(cell.risk_score * 100)}% risk`, {
        direction: "top",
        opacity: 0.92,
        sticky: true,
      });
      layer.addTo(layerGroup);

      const layerBounds = layer.getBounds();
      if (layerBounds.isValid()) {
        bounds.extend(layerBounds);
      }
    }

    if (bounds.isValid() && lastFitKeyRef.current !== fitKey) {
      map.fitBounds(bounds.pad(0.18), {
        animate: false,
        maxZoom: 9,
        padding: [42, 42],
      });
      lastFitKeyRef.current = fitKey;
    } else if (!bounds.isValid() && bbox.length === 4) {
      map.fitBounds(
        [
          [bbox[1], bbox[0]],
          [bbox[3], bbox[2]],
        ],
        { animate: false, padding: [42, 42] },
      );
    }
  }, [bbox, fitKey, riskCells, selectedH3Id]);

  useEffect(() => {
    const layerGroup = hotspotLayerRef.current;
    if (!layerGroup) {
      return;
    }

    layerGroup.clearLayers();
    for (const hotspot of hotspots) {
      L.circleMarker([hotspot.lat, hotspot.lon], {
        color: "#ffffff",
        fillColor: "#d9480f",
        fillOpacity: 0.86,
        radius: hotspotRadius(hotspot),
        weight: 2,
      })
        .bindTooltip("Observed hotspot", { direction: "top", sticky: true })
        .addTo(layerGroup);
    }
  }, [hotspots]);

  useEffect(() => {
    const revealLayer = revealLayerRef.current;
    const futureHotspotLayer = futureHotspotLayerRef.current;
    if (!revealLayer || !futureHotspotLayer) {
      return;
    }

    revealLayer.clearLayers();
    futureHotspotLayer.clearLayers();
    if (!revealVisible || !reveal) {
      return;
    }

    for (const cell of comparisonCells) {
      L.geoJSON(cell.geometry, {
        style: {
          color: revealStroke(cell.status),
          fillColor: revealFill(cell.status),
          fillOpacity: 0.48,
          opacity: 0.95,
          weight: cell.status === "miss" ? 2.4 : 1.5,
        },
      })
        .bindTooltip(revealLabel(cell.status), { direction: "top", sticky: true })
        .addTo(revealLayer);
    }

    for (const hotspot of reveal.actual_hotspots) {
      L.circleMarker([hotspot.lat, hotspot.lon], {
        color: "#111111",
        fillColor: "#d7191c",
        fillOpacity: 0.9,
        radius: Math.max(6, hotspotRadius(hotspot) + 1),
        weight: 2,
      })
        .bindTooltip("Actual future hotspot", { direction: "top", sticky: true })
        .addTo(futureHotspotLayer);
    }
  }, [comparisonCells, reveal, revealVisible]);

  useEffect(() => {
    const layerGroup = allocationLayerRef.current;
    if (!layerGroup) {
      return;
    }

    layerGroup.clearLayers();
    for (const allocation of allocations) {
      const cell = cellsById.get(allocation.assigned_h3_id);
      if (!cell) {
        continue;
      }

      L.circleMarker([cell.centroid.lat, cell.centroid.lon], {
        color: "#ffffff",
        fillColor: "#111111",
        fillOpacity: 0.95,
        radius: 7.5,
        weight: 2,
      })
        .bindTooltip(allocation.resource_id, { direction: "top", sticky: true })
        .addTo(layerGroup);
    }
  }, [allocations, cellsById]);

  return (
    <div className="map-panel" role="region" aria-label="Interactive bushfire risk forecast map">
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

      <div
        ref={containerRef}
        className="map-container"
        aria-label="Pan and zoom map showing forecast risk cells, hotspots, allocation points, and reveal comparison layers"
      />

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

function riskFill(risk: number) {
  if (risk >= 0.7) {
    return "#bd0026";
  }
  if (risk >= 0.5) {
    return "#f03b20";
  }
  if (risk >= 0.28) {
    return "#feb24c";
  }
  return "#ffeda0";
}

function revealFill(status: RevealCell["status"]) {
  if (status === "hit") {
    return "#1a9850";
  }
  if (status === "miss") {
    return "#d7191c";
  }
  return "#9ca3af";
}

function revealStroke(status: RevealCell["status"]) {
  if (status === "hit") {
    return "#0f6b39";
  }
  if (status === "miss") {
    return "#9f1239";
  }
  return "#4b5563";
}

function revealLabel(status: RevealCell["status"]) {
  if (status === "hit") {
    return "Hit";
  }
  if (status === "miss") {
    return "Miss";
  }
  return "False alarm";
}

function hotspotRadius(hotspot: Hotspot) {
  return Math.max(4.5, Math.min(11, hotspot.intensity / 11));
}
