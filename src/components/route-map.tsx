"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import type { Point, Visit } from "@/lib/types";

type Props = { start: Point | null; end: Point | null; stops: Visit[]; geometry: [number, number][] };

function MapBounds({ points }: { points: Point[] }) {
  const map = useMap();
  const signature = points.map((p) => p.id + ":" + p.lat + "," + p.lng).join("|");
  useEffect(() => {
    if (!points.length) return;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
    if (points.length === 1) map.setView([points[0].lat, points[0].lng], 16, { animate: true });
    else map.fitBounds(bounds.pad(0.22), { maxZoom: 16, animate: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, signature]);
  return null;
}

function pin(text: string, kind: "start" | "end" | "stop", visited = false) {
  const cls = kind === "stop" ? (visited ? "visited" : "") : kind;
  // Texto vindo somente da contagem de paradas/constantes, nunca do usuário.
  return L.divIcon({ className: "route-icon", html: '<div class="map-pin ' + cls + '">' + text + "</div>", iconSize: [34, 34], iconAnchor: [17, 17] });
}

export default function RouteMap({ start, end, stops, geometry }: Props) {
  const points = useMemo(() => [start, ...stops, end].filter((p): p is Point => Boolean(p)), [start, stops, end]);
  return <MapContainer center={[-29.762, -51.148]} zoom={13} zoomControl={false} scrollWheelZoom={false} className="h-full w-full">
    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
    <MapBounds points={points} />
    {geometry.length > 1 ? <Polyline positions={geometry} pathOptions={{ color: "#126a4d", weight: 6, opacity: 0.92, lineCap: "round", lineJoin: "round" }} /> : null}
    {start ? <Marker position={[start.lat, start.lng]} icon={pin("S", "start")} /> : null}
    {stops.map((p, i) => <Marker key={p.id} position={[p.lat, p.lng]} icon={pin(String(i + 1), "stop", p.status === "visited")} />)}
    {end ? <Marker position={[end.lat, end.lng]} icon={pin("F", "end")} /> : null}
  </MapContainer>;
}
