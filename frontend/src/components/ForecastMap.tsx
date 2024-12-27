import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Frame, Reveal } from "../lib/replay";

export function ForecastMap({
  frame,
  reveal,
  selected,
  visibleIds,
  onSelect,
}: {
  frame: Frame;
  reveal: Reveal | null;
  selected: string | null;
  visibleIds: string[];
  onSelect: (cell: string) => void;
}) {
  const div = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const callback = useRef(onSelect);
  const [tilesMissing, setTilesMissing] = useState(false);
  const fitKey = useRef("");
  const needsFit = useRef(true);
  const bounds = useRef<L.LatLngBounds | null>(null);
  callback.current = onSelect;
  const fitEvent = () => {
    if (
      !map.current ||
      !bounds.current ||
      !div.current?.clientWidth ||
      !div.current?.clientHeight
    )
      return;
    map.current.fitBounds(bounds.current, {
      padding: [22, 22],
      maxZoom: 8,
      animate: false,
    });
    needsFit.current = false;
  };
  useEffect(() => {
    if (!div.current) return;
    fitKey.current = "";
    needsFit.current = true;
    const instance = L.map(div.current, {
      scrollWheelZoom: false,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
    }).setView([-34.8, 150.2], 7);
    map.current = instance;
    const recordViewport = () => {
      if (!div.current) return;
      const center = instance.getCenter();
      div.current.dataset.viewport = `${center.lat.toFixed(6)},${center.lng.toFixed(6)},${instance.getZoom()}`;
    };
    instance.on("moveend zoomend", recordViewport);
    recordViewport();
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 15,
    })
      .on("tileerror", () => setTilesMissing(true))
      .addTo(instance);
    layer.current = L.layerGroup().addTo(instance);
    const observer = new ResizeObserver(() => {
      if (!div.current?.clientWidth || !div.current?.clientHeight) return;
      instance.invalidateSize({ pan: false });
      if (needsFit.current) fitEvent();
    });
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
      reveal?.comparisonCells.map((c) => [c.h3_id, c.status]) || [],
    );
    const cells = new Map(frame.cells.map((c) => [c.h3_id, c]));
    const items = new Map(frame.cells.map((c) => [c.h3_id, c.geometry]));
    reveal?.comparisonCells.forEach((c) => items.set(c.h3_id, c.geometry));
    const visible = new Set(visibleIds);
    const labels = { hit: "Hit", miss: "Miss", false_alarm: "False alarm" };
    for (const [id, geometry] of items) {
      if (!visible.has(id)) continue;
      const cell = cells.get(id),
        status = statuses.get(id);
      const color = reveal
        ? status === "hit"
          ? "#24634c"
          : status === "miss"
            ? "#96334f"
            : "#a65912"
        : `hsl(24, ${35 + (cell?.score || 0) * 55}%, ${82 - (cell?.score || 0) * 50}%)`;
      const polygon = L.geoJSON(geometry, {
        style: {
          color: id === selected ? "#142d40" : color,
          weight: id === selected ? 4 : reveal ? 2 : cell?.selected ? 2 : 0.3,
          opacity: reveal || cell?.selected || id === selected ? 1 : 0.3,
          fillColor: color,
          fillOpacity: reveal ? 0.7 : 0.58,
          dashArray:
            status === "miss"
              ? "7 4"
              : status === "false_alarm"
                ? "2 4"
                : undefined,
          className: `forecast-cell ${status || "candidate"}${id === selected ? " inspected" : ""}`,
        },
      });
      polygon.bindTooltip(
        `${status ? labels[status] + " · " : ""}${cell ? `Score ${cell.score.toFixed(3)}${cell.selected ? " · top 10%" : ""}` : "Not scored · outside candidates"}`,
      );
      polygon.on("click", () => callback.current(id));
      polygon.addTo(layer.current);
    }
    const points = [...items.values()].flatMap((g) =>
      g.coordinates[0].map((p) => L.latLng(p[1], p[0])),
    );
    if (points.length) bounds.current = L.latLngBounds(points);
    if (fitKey.current !== frame.id) {
      fitKey.current = frame.id;
      needsFit.current = true;
    }
    if (needsFit.current) fitEvent();
  }, [frame, reveal, selected, visibleIds]);
  return (
    <div className="map-wrap">
      <button className="fit-event" onClick={fitEvent}>
        Fit event
      </button>
      <div
        ref={div}
        className="forecast-map"
        role="region"
        aria-label="Historical forecast map; every cell can also be inspected in the Table view"
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
