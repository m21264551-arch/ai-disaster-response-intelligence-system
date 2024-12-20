import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Frame, Reveal } from "../lib/replay";

export function ForecastMap({
  frame,
  reveal,
  selected,
  onSelect,
}: {
  frame: Frame;
  reveal: Reveal | null;
  selected: string | null;
  onSelect: (cell: string) => void;
}) {
  const div = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    layer = useRef<L.LayerGroup | null>(null),
    callback = useRef(onSelect);
  const [tilesMissing, setTilesMissing] = useState(false);
  const fitKey = useRef("");
  callback.current = onSelect;
  useEffect(() => {
    if (!div.current) return;
    const instance = L.map(div.current, { scrollWheelZoom: false }).setView(
      [-34.8, 150.2],
      7,
    );
    map.current = instance;
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 15,
    })
      .on("tileerror", () => setTilesMissing(true))
      .addTo(instance);
    layer.current = L.layerGroup().addTo(instance);
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(div.current);
    return () => {
      observer.disconnect();
      instance.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    if (!layer.current || !map.current) return;
    layer.current.clearLayers();
    const statuses = new Map(
      reveal?.comparisonCells.map((c) => [c.h3_id, c]) || [],
    );
    const items = new Map(frame.cells.map((c) => [c.h3_id, c.geometry]));
    reveal?.comparisonCells.forEach((c) => items.set(c.h3_id, c.geometry));
    for (const [id, geometry] of items) {
      const cell = frame.cells.find((c) => c.h3_id === id),
        status = statuses.get(id)?.status;
      const color = reveal
        ? status === "hit"
          ? "#286953"
          : status === "miss"
            ? "#9a3d57"
            : status === "false_alarm"
              ? "#aa641e"
              : "#667075"
        : `hsl(24, ${35 + (cell?.score || 0) * 55}%, ${80 - (cell?.score || 0) * 48}%)`;
      const polygon = L.geoJSON(geometry, {
        style: {
          color: id === selected ? "#152c3b" : color,
          weight: id === selected ? 4 : cell?.selected ? 2 : 0.7,
          fillColor: color,
          fillOpacity: reveal ? (status ? 0.65 : 0.08) : 0.65,
          dashArray:
            reveal && status === "miss"
              ? "5 3"
              : reveal && status === "false_alarm"
                ? "2 3"
                : undefined,
        },
      });
      polygon.bindTooltip(
        `${id} · ${status || (cell ? `score ${(cell.score * 100).toFixed(1)}%${cell.selected ? " · selected" : ""}` : "outside candidates")}`,
      );
      polygon.on("click", () => callback.current(id));
      polygon.addTo(layer.current);
    }
    const nextFit = frame.id + String(Boolean(reveal));
    if (fitKey.current !== nextFit) {
      const points = [...items.values()].flatMap((g) =>
        g.coordinates[0].map((p) => L.latLng(p[1], p[0])),
      );
      if (points.length)
        map.current.fitBounds(L.latLngBounds(points), {
          padding: [18, 18],
          maxZoom: 8,
          animate: false,
        });
      fitKey.current = nextFit;
    }
    const selectedGeometry = selected && items.get(selected);
    if (selectedGeometry) {
      const ring = selectedGeometry.coordinates[0];
      const lat = ring.reduce((v, p) => v + p[1], 0) / ring.length,
        lon = ring.reduce((v, p) => v + p[0], 0) / ring.length;
      map.current.panInside([lat, lon], { padding: [24, 24], animate: false });
    }
  }, [frame, reveal, selected]);
  return (
    <div className="map-wrap">
      <div
        ref={div}
        className="forecast-map"
        role="region"
        aria-label="Historical forecast map; every cell can also be inspected in the table below"
      />
      {tilesMissing && (
        <p className="tile-note">
          Basemap tiles unavailable. Forecast geometry and the cell table remain
          available.
        </p>
      )}
    </div>
  );
}
