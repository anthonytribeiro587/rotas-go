"use client";

import { useEffect, useRef, useState } from "react";
import type { Point, Visit } from "@/lib/types";

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

declare global {
  interface Window {
    __rotasGoGoogleMapReady?: () => void;
  }
}
let loader: Promise<void> | null = null;

function loadMaps(key: string) {
  if (typeof google !== "undefined" && google.maps?.Map) return Promise.resolve();
  if (loader) return loader;
  loader = new Promise<void>((resolve, reject) => {
    let completed = false;
    const finish = (error?: Error) => {
      if (completed) return;
      completed = true;
      clearTimeout(timeout);
      if (error) { loader = null; reject(error); }
      else resolve();
    };
    window.__rotasGoGoogleMapReady = () => finish();
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(key) +
      "&v=weekly&language=pt-BR&region=BR&callback=__rotasGoGoogleMapReady";
    script.onerror = () => finish(new Error("Não foi possível carregar o Google Maps."));
    const timeout = window.setTimeout(() => finish(new Error("Google Maps demorou a carregar.")), 15000);
    document.head.appendChild(script);
  });
  return loader;
}

function pinColor(kind: string) {
  if (kind === "start") return "#19392e";
  if (kind === "end") return "#df9845";
  if (kind === "skipped") return "#a28560";
  if (kind === "visited") return "#819b8a";
  return "#087d59";
}

export default function GoogleRouteMap(props: Props) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const lineRef = useRef<google.maps.Polyline | null>(null);
  const propsRef = useRef(props);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  propsRef.current = props;

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY;
    if (!key || !elementRef.current) { setError("Falta configurar a chave pública do Google Maps."); return; }
    let cancelled = false;
    let listener: google.maps.MapsEventListener | undefined;
    setError("");
    loadMaps(key).then(() => {
      if (cancelled || !elementRef.current) return;
      const map = new google.maps.Map(elementRef.current, {
        center: { lat: -29.762, lng: -51.148 },
        zoom: 13,
        clickableIcons: false,
        gestureHandling: "greedy",
        zoomControl: true,
        scaleControl: true,
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false
      });
      mapRef.current = map;
      listener = map.addListener("click", (event: google.maps.MapMouseEvent) => {
        if (!propsRef.current.pickMode || !event.latLng) return;
        propsRef.current.onPick?.({ lat: event.latLng.lat(), lng: event.latLng.lng() });
      });
      renderRoute(map, propsRef.current, markersRef.current, lineRef);
      setError("");
    }).catch(err => {
      if (!cancelled) setError(err instanceof Error ? err.message : "Falha ao abrir o mapa.");
    });
    return () => {
      cancelled = true;
      listener?.remove();
      lineRef.current?.setMap(null);
      lineRef.current = null;
      for (const marker of markersRef.current) marker.setMap(null);
      markersRef.current = [];
      if (mapRef.current) google.maps.event.clearInstanceListeners(mapRef.current);
      mapRef.current = null;
      if (elementRef.current) elementRef.current.replaceChildren();
    };
  }, [revision]);

  useEffect(() => {
    if (mapRef.current) renderRoute(mapRef.current, propsRef.current, markersRef.current, lineRef);
  }, [props.start, props.end, props.stops, props.geometry, props.focus, props.draftPoint]);

  return <div className="relative h-full w-full">
    <div ref={elementRef} className="google-map h-full w-full" aria-label="Mapa Google Maps com roteiro de visitas" />
    {error ? <div role="alert" className="absolute inset-x-4 top-1/2 z-[700] mx-auto max-w-[340px] -translate-y-1/2 rounded-2xl border border-line bg-white p-5 text-center shadow-xl">
      <p className="text-sm font-extrabold text-ink">Google Maps indisponível</p>
      <p className="mt-2 text-xs leading-relaxed text-muted">{error}</p>
      <button type="button" className="mt-3 rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white" onClick={() => setRevision(value => value + 1)}>Tentar novamente</button>
    </div> : null}
  </div>;
}

function renderRoute(
  map: google.maps.Map,
  props: Props,
  markers: google.maps.Marker[],
  lineRef: { current: google.maps.Polyline | null }
) {
  markers.forEach(marker => marker.setMap(null));
  markers.length = 0;
  const add = (point: { lat: number; lng: number }, label: string, kind: string) => {
    const marker = new google.maps.Marker({
      position: { lat: point.lat, lng: point.lng },
      map,
      title: label,
      label: { text: label, color: "#ffffff", fontSize: "13px", fontWeight: "800" },
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: pinColor(kind),
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 3,
        scale: 18
      }
    });
    markers.push(marker);
  };
  if (props.start) add(props.start, "S", "start");
  props.stops.forEach((stop, index) => add(stop, stop.status === "skipped" ? "×" : String(index + 1), stop.status));
  if (props.end) add(props.end, "F", "end");
  if (props.draftPoint) add(props.draftPoint, "+", "pending");
  lineRef.current?.setMap(null);
  lineRef.current = null;
  if (props.geometry.length > 1) {
    lineRef.current = new google.maps.Polyline({
      map,
      path: props.geometry.map(([lat, lng]) => ({ lat, lng })),
      strokeColor: "#087d59",
      strokeWeight: 6,
      strokeOpacity: 0.94,
      clickable: false
    });
  }
  const points = [props.start, ...props.stops, props.end].filter((p): p is Point => Boolean(p));
  if (!points.length && props.focus) points.push({ ...props.focus, id: "focus", name: "Região", address: "" });
  if (points.length === 1) { map.setCenter({ lat: points[0].lat, lng: points[0].lng }); map.setZoom(15); }
  else if (points.length > 1) {
    const bounds = new google.maps.LatLngBounds();
    for (const place of points) bounds.extend({ lat: place.lat, lng: place.lng });
    for (const [lat, lng] of props.geometry) bounds.extend({ lat, lng });
    map.fitBounds(bounds, 72);
  }
}
