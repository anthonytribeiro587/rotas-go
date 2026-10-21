"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, LoaderCircle, LocateFixed, MapPin, Search, X } from "lucide-react";
import type { SearchResult } from "@/lib/types";

type Center = { lat: number; lng: number };
type Props = {
  label: string;
  placeholder: string;
  onPick: (result: SearchResult) => void;
  current?: { name: string; address: string } | null;
  center?: Center | null;
  allowGeolocation?: boolean;
  onGeolocation?: () => void;
  onClear?: () => void;
  purpose?: "place" | "region";
};

const requestCache = new Map<string, SearchResult[]>();

export function LocationSearch({ label, placeholder, onPick, current, center, allowGeolocation, onGeolocation, onClear, purpose = "place" }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const sequence = useRef(0);
  const listId = useId();

  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);

  useEffect(() => {
    const id = ++sequence.current;
    const q = query.trim().replace(/\s+/g, " ");
    if (!open || q.length < 2) { setResults([]); setBusy(false); setError(""); return; }
    const key = [purpose, q.toLocaleLowerCase("pt-BR"), center?.lat.toFixed(3) || "", center?.lng.toFixed(3) || ""].join("|");
    const cached = requestCache.get(key);
    if (cached) { setResults(cached); setBusy(false); setError(""); return; }
    const controller = new AbortController();
    setBusy(true);
    setError("");
    setResults([]);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q });
        if (purpose === "region") params.set("mode", "city");
        if (center) { params.set("lat", String(center.lat)); params.set("lng", String(center.lng)); }
        const response = await fetch("/api/search?" + params, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Busca indisponível");
        if (id !== sequence.current) return;
        const places: SearchResult[] = Array.isArray(data.results) ? data.results : [];
        if (requestCache.size > 180) requestCache.clear();
        requestCache.set(key, places);
        setResults(places);
        setActive(0);
      } catch (e) {
        if (!controller.signal.aborted && id === sequence.current) {
          setError(e instanceof Error ? e.message : "Falha ao buscar locais.");
        }
      } finally {
        if (!controller.signal.aborted && id === sequence.current) setBusy(false);
      }
    }, 360);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, open, center?.lat, center?.lng, purpose]);

  const selectPlace = (place: SearchResult) => {
    onPick(place);
    setQuery("");
    setResults([]);
    setOpen(false);
    setShowAll(false);
  };
  const visible = showAll ? results : results.slice(0, 5);
  const showResults = open && query.trim().length >= 2;
  return <div ref={rootRef} className="location-search min-w-0">
    <div className="mb-2 flex items-center justify-between gap-2">
      <label htmlFor={listId + "-input"} className="text-[12px] font-bold text-[#31463d]">{label}</label>
      {current && !query ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent"><Check size={12} /> Definido</span> : null}
    </div>
    <div className="flex min-h-[50px] items-center gap-2 rounded-xl border border-[#dce6dd] bg-white px-3.5 transition-colors focus-within:border-accent focus-within:ring-[3px] focus-within:ring-[#126a4d]/10">
      <Search size={18} className="shrink-0 text-[#829489]" />
      <input
        id={listId + "-input"}
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={showResults}
        aria-controls={listId}
        className="h-[48px] min-w-0 flex-1 bg-transparent text-[14px] font-medium text-ink outline-none placeholder:font-normal placeholder:text-[#93a198]"
        placeholder={placeholder}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); setShowAll(false); }}
        onKeyDown={(event) => {
          if (event.key === "Escape") { setOpen(false); return; }
          if (!showResults || results.length === 0) return;
          if (event.key === "ArrowDown") { event.preventDefault(); setActive((v) => Math.min(v + 1, results.length - 1)); setShowAll(true); }
          if (event.key === "ArrowUp") { event.preventDefault(); setActive((v) => Math.max(v - 1, 0)); }
          if (event.key === "Enter") { event.preventDefault(); selectPlace(results[active] || results[0]); }
        }}
        autoComplete="off"
        spellCheck={false}
      />
      {busy ? <LoaderCircle size={17} className="shrink-0 animate-spin text-accent" aria-label="Buscando locais" /> : null}
      {query ? <button type="button" aria-label="Limpar busca" onClick={() => { setQuery(""); setResults([]); setOpen(false); }} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-canvas"><X size={16} /></button> : null}
      {!query && current && onClear ? <button type="button" aria-label="Limpar seleção" onClick={onClear} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-canvas"><X size={16} /></button> : null}
      {allowGeolocation ? <button type="button" title="Usar minha localização atual" aria-label="Usar minha localização atual" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#e7f3ea] text-accent hover:bg-[#d5ebdd]" onClick={onGeolocation}><LocateFixed size={18} /></button> : null}
    </div>
    {current && !query ? <p className="mt-1.5 truncate px-1 text-[12px] text-[#657a6e]" title={current.address}>{current.name}{current.address && current.address !== current.name ? " · " + current.address : ""}</p> : null}
    {showResults ? <div id={listId} role="listbox" aria-label={"Resultados para " + label} className="search-results mt-2 overflow-hidden rounded-xl border border-[#dfe8e0] bg-white">
      {busy && results.length === 0 ? <div className="flex items-center gap-2 px-4 py-4 text-[13px] text-muted"><LoaderCircle size={16} className="animate-spin" /> Procurando locais…</div> : null}
      {error ? <p role="alert" className="px-4 py-3 text-[13px] text-red-700">{error}</p> : null}
      {!busy && !error && results.length === 0 ? <div className="px-4 py-3 text-[13px] leading-relaxed text-muted">{purpose === "region" ? "Cidade não encontrada. Digite somente o nome da cidade." : "Nenhum resultado. Tente incluir bairro e cidade ou marque diretamente no mapa."}</div> : null}
      {visible.map((place, i) => <button
        type="button" role="option" aria-selected={active === i}
        key={place.name + place.lat + "," + place.lng}
        className={"flex min-h-[59px] w-full items-center gap-3 border-b border-[#eff3ef] px-3.5 py-2.5 text-left last:border-0 hover:bg-[#f1f7f2] " + (active === i ? "bg-[#f7faf7]" : "")}
        onMouseEnter={() => setActive(i)}
        onClick={() => selectPlace(place)}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#eef5ef] text-accent"><MapPin size={16}/></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-bold text-ink">{place.name}</span>
          <span className="mt-0.5 block truncate text-[11px] text-muted">{place.address}</span>
        </span>
        {typeof place.distanceKm === "number" ? <span className="shrink-0 rounded-lg bg-[#edf5ed] px-2 py-1 text-[10px] font-bold text-accent">{place.distanceKm < 1 ? Math.round(place.distanceKm * 1000) + " m" : place.distanceKm.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " km"}</span> : null}
      </button>)}
      {results.length > 5 && !showAll ? <button type="button" className="flex w-full items-center justify-center gap-1 py-2.5 text-xs font-bold text-accent hover:bg-canvas" onClick={() => setShowAll(true)}>Ver mais {results.length - 5} resultados <ChevronDown size={14}/></button> : null}
      {!busy && results.length > 0 ? <p className="border-t border-[#edf2ed] px-3 py-2 text-[10px] text-muted">{results.some(p => p.provider === "geoapify") ? <>Pesquisa: <a href="https://www.geoapify.com/" target="_blank" rel="noopener noreferrer" className="underline">Geoapify</a> · Dados abertos · Confira o endereço</> : "Dados OpenStreetMap · Confira o endereço antes de adicionar"}</p> : null}
    </div> : null}
  </div>;
}
