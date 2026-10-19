"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, FileDown, Link2, LoaderCircle, MapPin, Search, X } from "lucide-react";
import { extractMapsUrls, type MapsLocation } from "@/lib/google-maps-links";
import type { SearchResult } from "@/lib/types";
import { LocationSearch } from "@/components/location-search";

type LinkRow = {
  id: string; url: string; location: MapsLocation | null;
  status: "loading" | "ready" | "review" | "error";
  error: string; name: string; address: string; point: SearchResult | null; selected: boolean;
};
type Props = {
  capacity: number;
  center?: { lat: number; lng: number } | null;
  onAdd: (places: SearchResult[]) => { added: number; duplicate: number };
  onClose: () => void;
};

function csvCell(value: string | number | null | undefined) {
  return '"' + String(value ?? "").replace(/"/g, '""') + '"';
}

export function ImportMapsLinks({ capacity, center, onAdd, onClose }: Props) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<LinkRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const openRef = useRef(true);
  useEffect(() => () => { openRef.current = false; abortRef.current?.abort(); }, []);
  const selected = rows.filter(row => row.selected);
  const ready = selected.filter(row => row.point && row.name.trim());
  const incomplete = selected.filter(row => !row.point || !row.name.trim());
  const resolved = rows.filter(row => row.status !== "loading");
  const complete = !busy && selected.length > 0 && incomplete.length === 0 && capacity > 0;

  const update = (id: string, patch: Partial<LinkRow>) => {
    setRows(previous => previous.map(row => row.id === id ? { ...row, ...patch } : row));
  };

  async function parseLinks() {
    const links = extractMapsUrls(text);
    if (!links.length) { setError("Cole pelo menos um link do Google Maps."); return; }
    if (links.length > 50) { setError("Importe até 50 links por vez e escolha até 18 para a rota."); return; }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(""); setNotice(""); setBusy(true);
    const initial: LinkRow[] = links.map((url, idx) => ({
      id: String(idx), url, location: null, status: "loading",
      error: "", name: "", address: "", point: null, selected: false
    }));
    setRows(initial);
    let cursor = 0;
    const worker = async () => {
      while (cursor < initial.length && !controller.signal.aborted) {
        const row = initial[cursor++];
        try {
          const response = await fetch("/api/resolve-maps-link", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: row.url }), signal: controller.signal
          });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || "Link não reconhecido.");
          const loc = body.result as MapsLocation;
          const hasPoint = loc.accurate && typeof loc.lat === "number" && typeof loc.lng === "number";
          const point: SearchResult | null = hasPoint ? {
            name: loc.title, address: loc.address || loc.title,
            lat: loc.lat as number, lng: loc.lng as number
          } : null;
          if (openRef.current) update(row.id, {
            location: loc, name: loc.title, address: loc.address,
            point, status: hasPoint ? "ready" : "review", error: ""
          });
        } catch (err) {
          if (!controller.signal.aborted && openRef.current) {
            update(row.id, { status: "error", error: err instanceof Error ? err.message : "Falha ao ler link." });
          }
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (openRef.current && !controller.signal.aborted) {
      setBusy(false);
      setRows(previous => {
        let count = 0;
        return previous.map(row => ({
          ...row, selected: Boolean(row.point) && count < capacity ? (++count, true) : false
        }));
      });
      setNotice("Links analisados. Confira os pontos, corrija os pendentes e escolha o que deseja importar.");
    }
  }

  function chooseLocation(row: LinkRow, place: SearchResult) {
    const point = { ...place, name: row.name || place.name };
    update(row.id, { point, address: place.address, status: "ready", error: "", selected: true });
  }

  function toggleRow(id: string) {
    setRows(previous => {
      const total = previous.filter(r => r.selected).length;
      return previous.map(r => r.id === id && r.point ? {
        ...r, selected: r.selected ? false : total < capacity
      } : r);
    });
  }

  function add() {
    if (!complete) return;
    const list = ready.map(row => ({
      ...row.point!,
      name: row.name.trim().slice(0, 160),
      address: row.address || row.name.trim()
    }));
    const result = onAdd(list);
    if (result.added) onClose();
    else setError("Esses destinos já estão no roteiro. Desmarque os repetidos.");
  }

  function downloadCsv() {
    const data = rows.filter(row => row.point);
    if (!data.length) { setError("Primeiro, localize pelo menos um destino."); return; }
    const header = ["Nome do local", "Endereço", "Número", "Bairro", "Cidade", "UF", "CEP", "Latitude", "Longitude", "Observações", "Link Google Maps"];
    const lines = [header.map(csvCell).join(";"), ...data.map(row => [
      row.name, row.address, "", "", row.point?.city || "", row.point?.state || "", "",
      row.point!.lat, row.point!.lng, "", row.url
    ].map(csvCell).join(";"))];
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "RotasGO_Destinos_Google_Maps.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div role="dialog" aria-modal="true" aria-label="Importar links do Google Maps" className="fixed inset-0 z-[1900] flex items-center justify-center bg-[#0a2419]/55 sm:p-5">
    <div className="flex h-[100dvh] w-full max-w-[870px] flex-col overflow-hidden bg-white shadow-2xl sm:h-[min(90dvh,870px)] sm:rounded-2xl">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#e1eae3] px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#e6f2e9] text-accent"><Link2 size={21}/></span>
          <div><h2 className="text-[17px] font-extrabold text-ink">Importar links do Google Maps</h2><p className="text-[11px] leading-relaxed text-muted">Cole vários links, confira os locais e importe sem planilha</p></div>
        </div>
        <button type="button" aria-label="Fechar" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line" onClick={() => { abortRef.current?.abort(); onClose(); }}><X size={18}/></button>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        <div className="rounded-2xl border border-[#dceadf] bg-[#f6faf6] p-4">
          <label htmlFor="maps-paste" className="mb-2 block text-xs font-extrabold text-ink">Links das lojas (um por linha)</label>
          <textarea id="maps-paste" rows={4} value={text} onChange={e => setText(e.target.value)} disabled={busy} placeholder={"https://maps.app.goo.gl/...\nhttps://www.google.com/maps/place/...\nhttps://maps.app.goo.gl/..."} className="block w-full resize-y rounded-xl border border-[#d8e6da] bg-white p-3 text-[13px] leading-relaxed outline-none focus:border-accent disabled:opacity-70"/>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-[#526e5c]">{extractMapsUrls(text).length} links identificados · até 50 por importação</span>
            <button type="button" onClick={() => void parseLinks()} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-xs font-bold text-white disabled:opacity-55">{busy ? <LoaderCircle size={16} className="animate-spin"/> : <Search size={16}/>} {busy ? "Analisando links..." : "Analisar links"}</button>
          </div>
        </div>
        {error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-[12px] font-semibold text-red-800">{error}</p> : null}
        {notice ? <p className="rounded-xl bg-[#eaf5ea] p-3 text-[12px] font-semibold text-accent">{notice}</p> : null}
        <p className="text-[11px] leading-relaxed text-muted">Links com coordenadas explícitas podem ser importados diretamente. Links com apenas nome, pesquisa ou posição central do mapa exigem confirmação. Não acessamos o conteúdo privado nem sua conta Google.</p>

        {rows.length > 0 ? <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-sm font-extrabold text-ink">{resolved.length} de {rows.length} links analisados</p><p className="mt-1 text-[11px] text-muted">{rows.filter(r=>Boolean(r.point)).length} com ponto definido · {selected.length} selecionados (máximo {capacity})</p></div>
            <button type="button" disabled={!rows.some(row => row.point)} onClick={downloadCsv} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#dce8df] px-3 text-[12px] font-bold text-accent disabled:opacity-40"><FileDown size={16}/> Exportar CSV</button>
          </div>
          <div className="space-y-2.5">
          {rows.map((row, index) => <div key={row.id} className="rounded-xl border border-[#e0e9e1] bg-white p-3 sm:p-4">
            <div className="flex items-start gap-3">
              <input type="checkbox" aria-label={"Selecionar destino " + (index + 1)} checked={row.selected} disabled={!row.point || (!row.selected && selected.length >= capacity)} onChange={()=>toggleRow(row.id)} className="mt-1.5 h-4 w-4 accent-[#126a4d]"/>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold text-muted">#{index + 1}</span>
                  {row.status === "loading" ? <span className="inline-flex items-center gap-1 text-[11px] text-muted"><LoaderCircle size={13} className="animate-spin"/> Lendo link</span> :
                   row.status === "error" ? <span className="text-[11px] font-bold text-red-700">Link inválido</span> :
                   row.point ? <span className="inline-flex items-center gap-1 rounded-md bg-[#eaf6ec] px-2 py-0.5 text-[10px] font-bold text-accent"><CheckCircle2 size={12}/> Local localizado</span> :
                   <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">Conferir ponto</span>}
                  <a href={row.url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold text-accent hover:underline">Ver no Maps <ExternalLink size={12}/></a>
                </div>
                {row.status === "error" ? <p className="mt-1 text-[12px] text-red-700">{row.error}</p> :
                  <>
                    <label className="mt-2 block text-[10px] font-semibold text-muted">Nome da loja</label>
                    <input type="text" maxLength={160} value={row.name} onChange={e => update(row.id,{name:e.target.value})} placeholder="Nome do estabelecimento" className="mt-1 h-10 w-full rounded-lg border border-[#e0e7df] px-3 text-[13px] font-semibold outline-none focus:border-accent"/>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{row.address || "Endereço não identificado"}</p>
                    {row.location?.reason ? <p className="mt-1 text-[11px] text-[#5a7664]">{row.location.reason}</p> : null}
                    {row.point ? <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-accent"><MapPin size={12}/> {row.point.lat.toFixed(5)}, {row.point.lng.toFixed(5)}</p> : null}
                    {row.status === "review" ? <div className="mt-3 rounded-xl border border-[#e6ece5] bg-[#f8faf8] p-3">
                      <LocationSearch label="Selecione a localização correta" placeholder={row.name && row.name !== "Local do Google Maps" ? row.name : "Buscar endereço ou comércio"} center={center} onPick={place => chooseLocation(row,place)}/>
                      <p className="mt-2 text-[10px] text-muted">Se o local não aparecer, marque-o no mapa principal ou informe as coordenadas na planilha.</p>
                    </div> : null}
                  </>
                }
              </div>
            </div>
          </div>)}
          </div>
        </> : null}
      </div>
      <footer className="shrink-0 border-t border-[#e3eae3] bg-white p-4 sm:px-6">
        {incomplete.length ? <p className="mb-2 flex items-center gap-1 text-[11px] text-amber-800"><AlertCircle size={13}/> Selecione apenas os destinos com localização confirmada.</p> : null}
        <div className="flex gap-2">
          <button type="button" onClick={() => { abortRef.current?.abort(); onClose(); }} className="h-12 shrink-0 rounded-xl border border-line px-4 text-xs font-bold text-[#486256]">Cancelar</button>
          <button type="button" disabled={!complete} onClick={add} className="h-12 flex-1 rounded-xl bg-accent px-4 text-[13px] font-extrabold text-white disabled:opacity-45">Adicionar {ready.length} {ready.length === 1 ? "local" : "locais"} à rota</button>
        </div>
      </footer>
    </div>
  </div>;
}
