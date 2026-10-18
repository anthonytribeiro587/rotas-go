"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, MapPin, Navigation, Search, X } from "lucide-react";
import type { SearchResult } from "@/lib/types";

type Props = {
  label: string;
  placeholder: string;
  onPick: (result: SearchResult) => void;
  current?: { name: string; address: string } | null;
  center?: { lat: number; lng: number } | null;
  allowGeolocation?: boolean;
  onGeolocation?: () => void;
};

export function LocationSearch({ label, placeholder, onPick, current, center, allowGeolocation, onGeolocation }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const seq = useRef(0);
  useEffect(() => {
    if (!open || query.trim().length < 3) { setResults([]); setBusy(false); return; }
    const controller = new AbortController();
    const id = ++seq.current;
    const timer = setTimeout(async () => {
      setBusy(true);
      setError("");
      try {
        const params = new URLSearchParams({ q: query.trim() });
        if (center) { params.set("lat", String(center.lat)); params.set("lng", String(center.lng)); }
        const response = await fetch("/api/search?" + params, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Busca indisponível");
        if (id === seq.current) setResults(data.results || []);
      } catch (e) {
        if (!controller.signal.aborted && id === seq.current) setError(e instanceof Error ? e.message : "Erro de busca");
      } finally {
        if (id === seq.current && !controller.signal.aborted) setBusy(false);
      }
    }, 420);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, open, center?.lat, center?.lng]);

  return <div className="relative">
    <div className="mb-2 flex items-center justify-between">
      <label className="text-[11px] font-extrabold uppercase tracking-[.14em] text-muted">{label}</label>
      {current ? <span className="flex items-center gap-1 text-[11px] font-bold text-accent"><span className="h-1.5 w-1.5 rounded-full bg-accent" /> Definido</span> : null}
    </div>
    <div className="flex items-center gap-2 rounded-2xl border border-line bg-[#f8faf7] px-3 focus-within:border-accent">
      <Search size={17} className="shrink-0 text-muted" />
      <input
        aria-label={label}
        className="h-12 min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-ink outline-none placeholder:font-normal placeholder:text-muted"
        placeholder={placeholder}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        autoComplete="off"
      />
      {busy ? <LoaderCircle size={17} className="animate-spin text-accent" /> : null}
      {query ? <button type="button" aria-label="Limpar busca" onClick={() => { setQuery(""); setResults([]); }} className="p-1 text-muted"><X size={16} /></button> : null}
      {allowGeolocation ? <button type="button" title="Usar localização atual" aria-label="Usar minha localização atual" className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e4f0df] text-accent" onClick={onGeolocation}><Navigation size={17} /></button> : null}
    </div>
    {current && !query ? <p className="mt-1.5 truncate text-xs text-muted" title={current.address}>{current.name} · {current.address}</p> : null}
    {open && query.trim().length >= 3 ? <div className="search-popover absolute left-0 right-0 top-full z-[1100] mt-2 max-h-[260px] overflow-y-auto rounded-2xl border border-line bg-white p-1">
      {error ? <p role="alert" className="p-3 text-xs text-red-700">{error}</p> : null}
      {!busy && !error && results.length === 0 ? <p className="p-3 text-xs text-muted">Nenhum local encontrado. Tente endereço mais completo.</p> : null}
      {results.map((place, i) => <button
        type="button" key={[place.lat, place.lng, i].join("-")}
        className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left hover:bg-canvas active:bg-canvas"
        onClick={() => { onPick(place); setQuery(""); setResults([]); setOpen(false); }}
      >
        <MapPin className="mt-0.5 shrink-0 text-accent" size={17} />
        <span className="min-w-0"><span className="block truncate text-sm font-bold">{place.name}</span><span className="block truncate text-xs text-muted">{place.address}</span></span>
      </button>)}
    </div> : null}
  </div>;
}
