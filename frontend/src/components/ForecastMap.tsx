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
  focusRequest,
}: {
  frame: Frame | null;
  reveal: Reveal | null;
  selected: string | null;
  visibleIds: string[];
  onSelect: (cell: string) => void;
  focusRequest: {cell:string;nonce:number} | null;
}) {
  const div = useRef<HTMLDivElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const callback = useRef(onSelect);
  const [tilesMissing, setTilesMissing] = useState(false);
  const [small, setSmall] = useState(()=>window.matchMedia("(max-width:999px)").matches || L.Browser.mobile);
  const [moving, setMoving] = useState(false);
  useEffect(()=>{
    const query=window.matchMedia("(max-width:999px)");
    const resize=()=>setSmall(query.matches || L.Browser.mobile);
    query.addEventListener("change",resize);
    return ()=>query.removeEventListener("change",resize);
  },[]);
  const needsFit = useRef(true);
  const bounds = useRef<L.LatLngBounds | null>(null);
  const focusedRequest = useRef<number | null>(null);
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
    needsFit.current = true;
    const instance = L.map(div.current, {
      scrollWheelZoom: false,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      dragging: !window.matchMedia("(max-width:999px)").matches && !L.Browser.mobile,
      touchZoom: !L.Browser.mobile,
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
    let previousSize = "";
    const observer = new ResizeObserver(() => {
      if (!div.current?.clientWidth || !div.current?.clientHeight) return;
      const size = `${div.current.clientWidth}:${div.current.clientHeight}`;
      // Hidden presentations return to the same map, without resetting its tiles.
      if (size === previousSize) return;
      previousSize = size;
      const center = instance.getCenter(), zoom = instance.getZoom();
      instance.invalidateSize({ pan: false });
      if (needsFit.current) fitEvent();
      else {
        // Leaflet supports reset in setView; its ZoomPanOptions type omits it.
        // A full size reset preserves the exact centre, avoiding rounded panning.
        const options: L.ZoomPanOptions & { reset: boolean } = { animate: false, reset: true };
        instance.setView(center, zoom, options);
      }
    });
    observer.observe(div.current);
    return () => {
      observer.disconnect();
      instance.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    // Keep the basemap mounted during requests, but don't inspect an old frame.
    if (wrapper.current) wrapper.current.inert = !frame;
  }, [frame]);
  useEffect(() => {
    if (!frame || !layer.current || !map.current) return;
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
        : `hsl(27, ${20 + (cell?.score || 0) * 30}%, ${88 - (cell?.score || 0) * 48}%)`;
      const polygon = L.geoJSON(geometry, {
        style: {
          color: id === selected ? "#142d40" : color,
          weight: id === selected ? 4 : reveal ? 2 : cell?.selected ? 2 : 0.6,
          opacity: reveal || cell?.selected || id === selected ? 1 : 0.5,
          fillColor: color,
          fillOpacity: reveal ? 0.7 : cell?.selected ? 0.8 : 0.42,
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
      if(id===selected) L.geoJSON(geometry,{interactive:false,style:{color:"#fff",weight:8,opacity:1,fillOpacity:0}}).addTo(layer.current);
      polygon.addTo(layer.current);
    }
    const points = [...items.values()].flatMap((g) =>
      g.coordinates[0].map((p) => L.latLng(p[1], p[0])),
    );
    if (points.length) bounds.current = L.latLngBounds(points);
    // A new cutoff updates the forecast, not the user's geographic viewport.
    // Initial load and the explicit Fit event button are the only auto-fit paths.
    if (needsFit.current) fitEvent();
  }, [frame, reveal, selected, visibleIds]);
  useEffect(()=>{
    if(!map.current) return;
    if(!small || moving) {map.current.dragging.enable();map.current.touchZoom.enable();}
    else {map.current.dragging.disable();map.current.touchZoom.disable();}
    if(div.current) div.current.dataset.movement=(!small || moving)?"enabled":"page-scroll";
  },[small,moving]);
  useEffect(()=>{
    if(!frame || !focusRequest || !map.current || focusedRequest.current === focusRequest.nonce) return;
    const geometry=frame.cells.find(c=>c.h3_id===focusRequest.cell)?.geometry || reveal?.comparisonCells.find(c=>c.h3_id===focusRequest.cell)?.geometry;
    if(!geometry) return;
    const cellBounds=L.latLngBounds(geometry.coordinates[0].map(p=>L.latLng(p[1],p[0])));
    map.current.invalidateSize({pan:false});
    map.current.fitBounds(cellBounds,{padding:[55,55],maxZoom:10,animate:false});
    focusedRequest.current=focusRequest.nonce;
  },[focusRequest,frame,reveal]);
  return (
    <div ref={wrapper} className="map-wrap" onKeyDown={event=>{if(event.key==="Escape") setMoving(false);}}>

      <button className="fit-event" onClick={fitEvent}>
        Fit event
      </button>
      {small && <button className="move-map" aria-pressed={moving} onClick={()=>setMoving(value=>!value)}>{moving ? "Done moving" : "Move map"}</button>}
      {small && moving && <p className="map-mode-note" role="status">Drag or pinch to move. Choose Done moving to scroll the page.</p>}
      <div
        tabIndex={0}
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
