"use client";

import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer, ZoomControl, useMap, useMapEvents } from "react-leaflet";
import type { Point, Visit } from "@/lib/types";
import GoogleRouteMap from "@/components/google-route-map";

type Props = {
  start: Point | null;
  end: Point | null;
  stops: Visit[];
  geometry: [number, number][];
  focus?: { lat: number; lng: number } | null;
  pickMode?: boolean;
  draftPoint?: { lat: number; lng: number } | null;
  onPick?: (point: { lat: number; lng: number }) => void;
};

function MapPicker({ enabled, onPick }: { enabled: boolean; onPick?: Props["onPick"] }) {
  useMapEvents({ click: event => { if (enabled) onPick?.({ lat: event.latlng.lat, lng: event.latlng.lng }); } });
  return null;
}

function MapBounds({ points, geometry }: { points: Point[]; geometry: [number, number][] }) {
  const map = useMap();
  const signature = points.map(p => p.id + ":" + p.lat + "," + p.lng).join("|") +
    "::" + geometry.length + "::" + (geometry.length ? geometry[0].join(",") + geometry[geometry.length - 1].join(",") : "");
  useEffect(() => {
    const handle = window.setTimeout(() => map.invalidateSize(), 40);
    if (points.length === 1) map.setView([points[0].lat, points[0].lng], 15, { animate: true });
    else if (points.length > 1) {
      const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
      geometry.forEach(p => bounds.extend(p));
      map.fitBounds(bounds.pad(0.16), { maxZoom: 16, animate: true });
    }
    return () => window.clearTimeout(handle);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, signature]);
  return null;
}

function pin(text: string, kind: "start" | "end" | "stop" | "skipped" | "draft", visited = false) {
  const cls = kind === "stop" ? (visited ? "visited" : "") : kind === "draft" ? "" : kind;
  return L.divIcon({
    className: "route-icon", iconSize: [35, 35], iconAnchor: [17, 17],
    // text always originates from a constant or numeric index, never a user string.
    html: '<div class="map-pin ' + cls + '">' + text + "</div>"
  });
}

export default function RouteMap({ start, end, stops, geometry, focus, pickMode = false, draftPoint, onPick }: Props) {
  const [tileErrors, setTileErrors] = useState(0);
  const [tileRevision, setTileRevision] = useState(0);
  const points = useMemo(() => {
    const trip = [start, ...stops, end].filter((p): p is Point => Boolean(p));
    return trip.length ? trip : focus ? [{ ...focus, id: "region", name: "Região", address: "" }] : [];
  }, [start, stops, end, focus]);

  if (process.env.NEXT_PUBLIC_MAP_PROVIDER === "google") {
    return <GoogleRouteMap start={start} end={end} stops={stops} geometry={geometry} focus={focus} pickMode={pickMode} draftPoint={draftPoint} onPick={onPick}/>;
  }

  return <div className="relative h-full w-full">
    <MapContainer
      center={[-29.762, -51.148]}
      zoom={13} zoomControl={false} scrollWheelZoom={true}
      className={"h-full w-full " + (pickMode ? "map-selecting" : "")}
    >
      {/* Tiles are fetched via a same-origin caching endpoint. No browser request to an external map server. */}
      <TileLayer key={tileRevision} url="/api/map-tiles/{z}/{x}/{y}.png"
        maxNativeZoom={18} maxZoom={19} keepBuffer={2}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        eventHandlers={{
          tileerror: () => setTileErrors(n => n + 1),
          tileload: () => setTileErrors(0)
        }}
      />
      <MapBounds points={points} geometry={geometry}/>
      <MapPicker enabled={pickMode} onPick={onPick}/>
      <ZoomControl position="bottomright"/>
      {geometry.length > 1 ? <Polyline positions={geometry} pathOptions={{ color: "#ffffff", weight: 9, opacity: 0.85 }}/> : null}
      {geometry.length > 1 ? <Polyline positions={geometry} pathOptions={{ color: "#087d59", weight: 5, opacity: 0.96, lineCap: "round", lineJoin: "round" }}/> : null}
      {start ? <Marker position={[start.lat, start.lng]} icon={pin("S", "start")}/> : null}
      {stops.map((point, index) =>
        <Marker key={point.id} position={[point.lat, point.lng]} icon={pin(point.status === "skipped" ? "×" : String(index + 1), point.status === "skipped" ? "skipped" : "stop", point.status === "visited")}/>
      )}
      {end ? <Marker position={[end.lat, end.lng]} icon={pin("F", "end")}/> : null}
      {draftPoint ? <Marker position={[draftPoint.lat, draftPoint.lng]} icon={pin("+", "draft")}/> : null}
    </MapContainer>
    {tileErrors >= 4 ? <div role="alert" className="absolute left-1/2 top-1/2 z-[700] w-[min(320px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-white p-4 text-center shadow-xl">
      <p className="text-sm font-bold text-ink">Não foi possível receber o mapa de ruas</p>
      <p className="mt-1 text-xs text-muted">O percurso e as visitas permanecem salvos. Verifique a conexão e tente novamente.</p>
      <button type="button" onClick={() => { setTileErrors(0); setTileRevision(n => n + 1); }} className="mt-3 rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white">Recarregar ruas</button>
    </div> : null}
  </div>;
}
