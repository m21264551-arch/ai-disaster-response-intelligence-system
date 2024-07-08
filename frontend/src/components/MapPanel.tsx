import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Allocation, Horizon, Hotspot, RevealResponse, RiskCell } from "../lib/types";
import {
  allocationFeatureCollection,
  futureHotspotFeatureCollection,
  hotspotFeatureCollection,
  revealCellFeatureCollection,
  riskFeatureCollection,
} from "../lib/geojson";
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

const EMPTY_COLLECTION: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

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
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onSelectRef = useRef(onSelectCell);
  const [loaded, setLoaded] = useState(false);

  const cellsById = useMemo(() => new Map(riskCells.map((cell) => [cell.h3_id, cell])), [riskCells]);
  const riskData = useMemo(() => riskFeatureCollection(riskCells), [riskCells]);
  const hotspotData = useMemo(() => hotspotFeatureCollection(hotspots), [hotspots]);
  const allocationData = useMemo(() => allocationFeatureCollection(allocations, cellsById), [allocations, cellsById]);
  const revealData = useMemo(() => revealCellFeatureCollection(revealVisible ? reveal : null), [reveal, revealVisible]);
  const futureHotspotData = useMemo(
    () => futureHotspotFeatureCollection(revealVisible ? reveal : null),
    [reveal, revealVisible],
  );

  useEffect(() => {
    onSelectRef.current = onSelectCell;
  }, [onSelectCell]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      center: [150.85, -35.1],
      zoom: 7.1,
      attributionControl: { compact: false },
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-left");
    map.on("load", () => {
      map.addSource("risk-cells", { type: "geojson", data: EMPTY_COLLECTION });
      map.addSource("hotspots", { type: "geojson", data: EMPTY_COLLECTION });
      map.addSource("allocations", { type: "geojson", data: EMPTY_COLLECTION });
      map.addSource("reveal-cells", { type: "geojson", data: EMPTY_COLLECTION });
      map.addSource("future-hotspots", { type: "geojson", data: EMPTY_COLLECTION });

      map.addLayer({
        id: "risk-cells-fill",
        type: "fill",
        source: "risk-cells",
        paint: {
          "fill-color": [
            "interpolate",
            ["linear"],
            ["get", "risk"],
            0.05,
            "#f2f2f2",
            0.35,
            "#d4d4d4",
            0.62,
            "#9b9b9b",
            0.88,
            "#8a5a2b",
          ],
          "fill-opacity": 0.6,
        },
      });

      map.addLayer({
        id: "risk-cells-outline",
        type: "line",
        source: "risk-cells",
        paint: {
          "line-color": "rgba(17,17,17,0.28)",
          "line-width": 0.7,
        },
      });

      map.addLayer({
        id: "selected-cell-outline",
        type: "line",
        source: "risk-cells",
        filter: ["==", ["get", "h3_id"], ""],
        paint: {
          "line-color": "#111111",
          "line-width": 2.4,
        },
      });

      map.addLayer({
        id: "reveal-cells-fill",
        type: "fill",
        source: "reveal-cells",
        paint: {
          "fill-color": [
            "match",
            ["get", "status"],
            "hit",
            "#111111",
            "miss",
            "#8a5a2b",
            "false_alarm",
            "#d7d7d7",
            "#ffffff",
          ],
          "fill-opacity": 0.54,
        },
      });

      map.addLayer({
        id: "reveal-cells-outline",
        type: "line",
        source: "reveal-cells",
        paint: {
          "line-color": [
            "match",
            ["get", "status"],
            "hit",
            "#111111",
            "miss",
            "#8a5a2b",
            "false_alarm",
            "#777777",
            "#ffffff",
          ],
          "line-width": [
            "match",
            ["get", "status"],
            "miss",
            2.4,
            1.4,
          ],
        },
      });

      map.addLayer({
        id: "hotspot-circles",
        type: "circle",
        source: "hotspots",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "intensity"], 30, 5, 110, 12],
          "circle-color": "#8a5a2b",
          "circle-opacity": 0.82,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
        },
      });

      map.addLayer({
        id: "future-hotspot-circles",
        type: "circle",
        source: "future-hotspots",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "intensity"], 30, 6, 110, 13],
          "circle-color": "#8a5a2b",
          "circle-opacity": 0.88,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#111111",
        },
      });

      map.addLayer({
        id: "allocation-points",
        type: "circle",
        source: "allocations",
        paint: {
          "circle-radius": 8,
          "circle-color": "#111111",
          "circle-opacity": 0.95,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });

      map.on("click", "risk-cells-fill", (event) => {
        const feature = event.features?.[0];
        const id = feature?.properties?.h3_id;
        if (typeof id === "string") {
          onSelectRef.current(id);
        }
      });

      map.on("mouseenter", "risk-cells-fill", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "risk-cells-fill", () => {
        map.getCanvas().style.cursor = "";
      });

      map.once("idle", () => setLoaded(true));
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) {
      return;
    }

    if (!map.isStyleLoaded() || !map.getLayer("selected-cell-outline")) {
      return;
    }

    (map.getSource("risk-cells") as GeoJSONSource | undefined)?.setData(riskData);
    (map.getSource("hotspots") as GeoJSONSource | undefined)?.setData(hotspotData);
    (map.getSource("allocations") as GeoJSONSource | undefined)?.setData(allocationData);
    (map.getSource("reveal-cells") as GeoJSONSource | undefined)?.setData(revealData);
    (map.getSource("future-hotspots") as GeoJSONSource | undefined)?.setData(futureHotspotData);
    map.setFilter("selected-cell-outline", ["==", ["get", "h3_id"], selectedH3Id ?? ""]);
  }, [allocationData, futureHotspotData, hotspotData, loaded, revealData, riskData, selectedH3Id]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) {
      return;
    }

    if (!map.isStyleLoaded() || !map.getLayer("selected-cell-outline")) {
      return;
    }

    if (riskCells.length > 0) {
      let minLat = Number.POSITIVE_INFINITY;
      let minLon = Number.POSITIVE_INFINITY;
      let maxLat = Number.NEGATIVE_INFINITY;
      let maxLon = Number.NEGATIVE_INFINITY;

      for (const cell of riskCells) {
        minLat = Math.min(minLat, cell.centroid.lat);
        minLon = Math.min(minLon, cell.centroid.lon);
        maxLat = Math.max(maxLat, cell.centroid.lat);
        maxLon = Math.max(maxLon, cell.centroid.lon);
      }

      map.fitBounds(
        [
          [minLon - 0.18, minLat - 0.18],
          [maxLon + 0.18, maxLat + 0.18],
        ],
        { padding: 58, duration: 320 },
      );
    } else if (bbox.length === 4) {
      map.fitBounds(
        [
          [bbox[0], bbox[1]],
          [bbox[2], bbox[3]],
        ],
        { padding: 56, duration: 320 },
      );
    }
  }, [bbox, loaded, riskCells]);

  const topRisk = riskCells[0]?.risk_score ?? 0;

  return (
    <div className="map-panel" role="region" aria-label="Bushfire risk forecast map">
      <div className="map-toolbar">
        <div>
          <span className="label-with-help">
            Risk Forecast
            <InfoTip
              label="Risk Forecast"
              text="Each colored hexagon is an H3 cell scored for future hotspot risk at the selected horizon."
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
        aria-label="Interactive map showing forecast risk cells, hotspots, allocation points, and reveal comparison layers"
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
          <div className="legend-ramp" />
          <span>Extreme</span>
        </div>
      )}
    </div>
  );
}
