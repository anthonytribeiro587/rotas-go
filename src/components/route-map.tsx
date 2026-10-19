"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { Point, Visit } from "@/lib/types";

const STYLE_URL = "https://tiles.openfreemap.org/styles/bright";
const INITIAL_CENTER: [number, number] = [-51.148, -29.762];

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

function routeGeoJSON(geometry: Props["geometry"]) {
  return {
    type: "FeatureCollection" as const,
    features: geometry.length > 1 ? [{
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "LineString" as const,
        coordinates: geometry.map(([lat, lng]) => [lng, lat])
      }
    }] : []
  };
}

function addPoint(map: maplibregl.Map, point: { lat: number; lng: number }, text: string, kind: string) {
  const element = document.createElement("div");
  element.className = "map-pin " + kind;
  element.textContent = text;
  element.setAttribute("aria-label", text === "S" ? "Ponto de partida" : text === "F" ? "Ponto final" : "Visita " + text);
  element.setAttribute("role", "img");
  return new maplibregl.Marker({ element, anchor: "center" })
    .setLngLat([point.lng, point.lat])
    .addTo(map);
}

function synchronizeMap(map: maplibregl.Map, props: Props, markers: maplibregl.Marker[]) {
  const { start, end, stops, geometry, focus, draftPoint } = props;
  if (!map.getSource("walking-route")) {
    if (!map.isStyleLoaded()) return;
    map.addSource("walking-route", { type: "geojson", data: routeGeoJSON(geometry) });
    map.addLayer({
      id: "walking-route-outline",
      type: "line",
      source: "walking-route",
      paint: { "line-color": "#ffffff", "line-width": 9, "line-opacity": 0.9 }
    });
    map.addLayer({
      id: "walking-route-line",
      type: "line",
      source: "walking-route",
      paint: { "line-color": "#087d59", "line-width": 5.5, "line-opacity": 0.96 }
    });
  } else {
    (map.getSource("walking-route") as maplibregl.GeoJSONSource).setData(routeGeoJSON(geometry));
  }

  markers.forEach(marker => marker.remove());
  markers.length = 0;
  if (start) markers.push(addPoint(map, start, "S", "start"));
  stops.forEach((stop, index) => markers.push(addPoint(map, stop, String(index + 1), stop.status === "visited" ? "visited" : "stop")));
  if (end) markers.push(addPoint(map, end, "F", "end"));
  if (draftPoint) markers.push(addPoint(map, draftPoint, "+", "draft"));

  const locations = [start, ...stops, end].filter((p): p is Point => Boolean(p));
  if (!locations.length && focus) locations.push({ ...focus, id: "region", name: "Região", address: "" });
  if (locations.length === 1) {
    map.easeTo({ center: [locations[0].lng, locations[0].lat], zoom: 15, duration: 450 });
  } else if (locations.length > 1) {
    const bounds = new maplibregl.LngLatBounds();
    locations.forEach(place => bounds.extend([place.lng, place.lat]));
    map.fitBounds(bounds, { padding: 68, maxZoom: 16, duration: 450 });
  }
}

export default function RouteMap({ start, end, stops, geometry, focus, pickMode = false, draftPoint, onPick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const propsRef = useRef<Props>({ start, end, stops, geometry, focus, pickMode, draftPoint, onPick });
  const [problem, setProblem] = useState("");
  const [revision, setRevision] = useState(0);
  propsRef.current = { start, end, stops, geometry, focus, pickMode, draftPoint, onPick };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let map: maplibregl.Map;
    let failureCount = 0;
    setProblem("");
    try {
      map = new maplibregl.Map({
        container,
        style: STYLE_URL,
        center: INITIAL_CENTER,
        zoom: 12.5,
        minZoom: 2,
        maxZoom: 19,
        attributionControl: true,
        scrollZoom: false,
        dragRotate: false,
        pitchWithRotate: false,
        maxPitch: 0
      });
    } catch {
      setProblem("Não foi possível iniciar o mapa neste navegador.");
      return;
    }

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.on("load", () => {
      setProblem("");
      synchronizeMap(map, propsRef.current, markersRef.current);
    });
    map.on("click", event => {
      if (propsRef.current.pickMode) {
        propsRef.current.onPick?.({ lat: event.lngLat.lat, lng: event.lngLat.lng });
      }
    });
    map.on("error", () => {
      failureCount += 1;
      if (failureCount >= 7) setProblem("Não foi possível carregar as ruas do mapa.");
    });

    const timeout = window.setTimeout(() => {
      if (!map.isStyleLoaded()) setProblem("O mapa demorou a carregar.");
    }, 15000);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => map.resize());
    observer?.observe(container);

    return () => {
      observer?.disconnect();
      window.clearTimeout(timeout);
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [revision]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && (map.isStyleLoaded() || map.getSource("walking-route"))) {
      synchronizeMap(map, propsRef.current, markersRef.current);
    }
  }, [start, end, stops, geometry, focus, draftPoint]);

  return <div className="relative h-full w-full">
    <div ref={containerRef} className={"h-full w-full " + (pickMode ? "map-selecting" : "")} aria-label="Mapa interativo OpenFreeMap" />
    {problem ? <div role="alert" className="absolute inset-x-4 top-1/2 z-[700] mx-auto max-w-[330px] -translate-y-1/2 rounded-2xl border border-[#dde9df] bg-white/95 p-4 text-center shadow-xl">
      <p className="text-sm font-extrabold text-ink">Mapa temporariamente indisponível</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{problem} Suas visitas continuam disponíveis na lista.</p>
      <div className="mt-3 flex justify-center gap-2">
        <button type="button" onClick={() => setRevision(n => n + 1)} className="rounded-xl bg-accent px-3 py-2 text-xs font-bold text-white">Tentar novamente</button>
        <a target="_blank" rel="noopener noreferrer" className="rounded-xl border border-line px-3 py-2 text-xs font-bold text-accent" href="https://www.openstreetmap.org/">Abrir mapa</a>
      </div>
    </div> : null}
  </div>;
}
