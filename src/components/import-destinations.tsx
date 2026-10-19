"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, CheckCircle2, ChevronDown, FileSpreadsheet, LoaderCircle, MapPin, Search, UploadCloud, X } from "lucide-react";
import { destinationsFromRows, normalizeHeader, parseDelimited, type ImportDestination, type RawCell } from "@/lib/import-destinations";
import type { SearchResult } from "@/lib/types";

type Preview = ImportDestination & {
  selected: boolean;
  confirmed: SearchResult | null;
  choices: SearchResult[];
  busy: boolean;
  query: string;
  lookupError: string;
};
type Props = {
  capacity: number;
  center?: { lat: number; lng: number } | null;
  onAdd: (destinations: SearchResult[]) => { added: number; duplicate: number };
  onClose: () => void;
};

function norm(value: string) {
  return normalizeHeader(value).replace(/\b(rua|avenida|av|r|bairro|cidade|rodovia)\b/g, "").replace(/\s+/g, " ").trim();
}
function scoreCandidate(row: ImportDestination, candidate: SearchResult): number {
  const city = norm(row.city), street = norm(row.street), name = norm(row.name);
  const haystack = norm(candidate.name + " " + candidate.address);
  let score = 0;
  if (city && norm(candidate.city || candidate.address).includes(city)) score += 5;
  else if (city) score -= 12;
  if (street && haystack.includes(street)) score += 7;
  if (name && norm(candidate.name) === name) score += 8;
  if (row.number && haystack.includes(row.number)) score += 4;
  return score;
}
function confidentMatch(row: ImportDestination, place: SearchResult): boolean {
  if (row.city && !norm(place.city || place.address).includes(norm(row.city))) return false;
  const address = norm(place.name + " " + place.address);
  const street = norm(row.street);
  const exactStreet = street.length >= 5 && address.includes(street);
  const exactName = norm(place.name) === norm(row.name);
  // No street number -> possibly a street midpoint, never silently mark as verified.
  if (row.number) {
    const numbered = new RegExp("(^|\\D)" + row.number.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\D|$)");
    return numbered.test(place.address) && (exactStreet || exactName);
  }
  return !row.street && exactName && Boolean(row.city);
}
function defaultQuery(row: ImportDestination) {
  return [row.street, row.number, row.city, row.state].filter(Boolean).join(", ") ||
    [row.name, row.city, row.state].filter(Boolean).join(", ");
}
function makePoint(row: ImportDestination, lat: number, lng: number): SearchResult {
  return { name: row.name, address: row.address, lat, lng, city: row.city, state: row.state };
}

export function ImportDestinations({ capacity, center, onAdd, onClose }: Props) {
  const [items, setItems] = useState<Preview[]>([]);
  const [filename, setFilename] = useState("");
  const [reading, setReading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "ready">("all");
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeRef = useRef(true);
  useEffect(() => () => { activeRef.current = false; abortRef.current?.abort(); }, []);

  const chosen = items.filter(item => item.selected);
  const confirmed = chosen.filter(item => item.confirmed && !item.error);
  const unresolved = chosen.filter(item => !item.confirmed || item.error);
  const valid = chosen.length > 0 && unresolved.length === 0 && !resolving;
  const matches = items.filter(item => filter === "all" ? true : filter === "ready" ? Boolean(item.confirmed) : !item.confirmed);

  async function readFile(file: File | undefined) {
    if (!file) return;
    setError(""); setMessage(""); setReading(true);
    abortRef.current?.abort(); setResolving(false);
    try {
      if (file.size > 4_500_000) throw new Error("Arquivo acima de 4,5 MB. Separe a lista em arquivos menores.");
      let matrix: RawCell[][];
      if (/\.xlsx$/i.test(file.name)) {
        const module = await import("read-excel-file/browser");
        const rows = await module.readSheet(file);
        matrix = rows as RawCell[][];
      } else if (/\.(csv|txt)$/i.test(file.name)) {
        matrix = parseDelimited(await file.text());
      } else {
        throw new Error("Formato não suportado. Use Excel .xlsx ou .csv.");
      }
      const records = destinationsFromRows(matrix);
      if (!records.length) throw new Error("Não encontrei destinos preenchidos. Preencha a aba Destinos antes de enviar.");
      if (!activeRef.current) return;
      setFilename(file.name);
      setFilter("all");
      setItems(records.map((row, index) => ({
        ...row, selected: index < capacity && !row.error,
        confirmed: row.error || row.latitude === null || row.longitude === null ? null : makePoint(row, row.latitude, row.longitude),
        choices: [], busy: false, query: defaultQuery(row), lookupError: ""
      })));
      setMessage(records.length + " destinos lidos. Confira os endereços antes de adicioná-los à rota.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao abrir a planilha.");
      setItems([]); setFilename("");
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function updateRow(id: string, updater: (item: Preview) => Preview) {
    setItems(prior => prior.map(item => item.id === id ? updater(item) : item));
  }

  function toggle(id: string) {
    setMessage("");
    setItems(prior => {
      const count = prior.filter(item => item.selected).length;
      return prior.map(item => item.id !== id ? item : ({ ...item, selected: !item.selected && count < capacity && !item.error }));
    });
  }

  async function fetchChoices(row: Preview, controller: AbortController, lookup: string) {
    const request = async (q: string) => {
      const params = new URLSearchParams({ q });
      if (center) { params.set("lat", String(center.lat)); params.set("lng", String(center.lng)); }
      const response = await fetch("/api/search?" + params, { signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Busca indisponível.");
      return (Array.isArray(data.results) ? data.results : []) as SearchResult[];
    };
    try {
      let places = await request(lookup);
      if (!places.length && row.street && row.name) {
        places = await request([row.name, row.city, row.state].filter(Boolean).join(", "));
      }
      if (controller.signal.aborted || !activeRef.current) return;
      const ranked = [...places].sort((a, b) => scoreCandidate(row, b) - scoreCandidate(row, a));
      const confident = ranked.length && confidentMatch(row, ranked[0]) && (ranked.length === 1 || scoreCandidate(row, ranked[0]) > scoreCandidate(row, ranked[1]) + 3);
      updateRow(row.id, item => ({
        ...item,
        busy: false,
        choices: ranked,
        confirmed: confident ? makePoint(row, ranked[0].lat, ranked[0].lng) : null,
        lookupError: ranked.length ? "" : "Nenhum ponto encontrado. Ajuste a busca ou marque a loja manualmente no mapa."
      }));
    } catch (e) {
      if (!controller.signal.aborted && activeRef.current) {
        updateRow(row.id, item => ({ ...item, busy: false, lookupError: e instanceof Error ? e.message : "Falha ao buscar endereço." }));
      }
    }
  }

  async function resolveAll() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const toSearch = items.filter(item => item.selected && !item.confirmed && !item.error);
    if (!toSearch.length) { setMessage("Todos os destinos selecionados já estão localizados."); return; }
    setResolving(true); setError(""); setMessage("");
    // Máximo de duas chamadas simultâneas; protege o serviço público de geocodificação.
    let cursor = 0;
    const worker = async () => {
      while (cursor < toSearch.length && !controller.signal.aborted) {
        const row = toSearch[cursor++];
        updateRow(row.id, v => ({ ...v, busy: true, choices: [], lookupError: "" }));
        await fetchChoices(row, controller, row.query);
        if (cursor < toSearch.length) await new Promise(resolve => setTimeout(resolve, 300));
      }
    };
    await Promise.all([worker(), worker()]);
    if (!controller.signal.aborted && activeRef.current) {
      setResolving(false);
      setMessage("Busca concluída. Confirme os resultados destacados como 'Revisar'.");
    }
  }

  async function searchRow(row: Preview) {
    if (row.query.trim().length < 2) return;
    const controller = abortRef.current || new AbortController();
    abortRef.current = controller;
    updateRow(row.id, v => ({ ...v, busy: true, lookupError: "" }));
    await fetchChoices(row, controller, row.query);
  }

  function accept(row: Preview, place: SearchResult) {
    updateRow(row.id, current => ({ ...current, confirmed: makePoint(row, place.lat, place.lng), lookupError: "" }));
  }
  function addSelected() {
    if (!valid) return;
    const list = confirmed.map(item => item.confirmed!).slice(0, capacity);
    const result = onAdd(list);
    if (result.added) onClose();
    else setError(result.duplicate ? "Esses destinos já estão no roteiro." : "Não foi possível adicionar os destinos.");
  }

  return <div className="fixed inset-0 z-[1900] flex items-center justify-center bg-[#0a2419]/55 px-0 py-0 sm:px-4 sm:py-5" role="dialog" aria-modal="true" aria-label="Importar planilha de destinos">
    <div className="flex h-[100dvh] w-full max-w-[920px] flex-col overflow-hidden bg-white shadow-2xl sm:h-[min(90dvh,850px)] sm:rounded-2xl">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#e1eae3] px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e6f2e9] text-accent"><FileSpreadsheet size={21}/></span>
          <div><h2 className="text-[17px] font-extrabold leading-tight text-ink">Importar destinos</h2><p className="mt-1 text-[11px] text-muted">Excel ou CSV · confira os locais antes de montar a rota</p></div>
        </div>
        <button type="button" onClick={() => { abortRef.current?.abort(); onClose(); }} className="flex h-10 w-10 items-center justify-center rounded-xl border border-line text-muted hover:bg-canvas" aria-label="Fechar importação"><X size={20}/></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="rounded-xl border border-[#d5e8d8] bg-[#f5faf6] p-4">
          <input ref={inputRef} type="file" accept=".xlsx,.csv,.txt" className="hidden" onChange={event => void readFile(event.target.files?.[0])} aria-label="Selecionar planilha"/>
          <button type="button" onClick={() => inputRef.current?.click()} disabled={reading} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#a4cbb0] bg-white px-4 py-4 text-sm font-extrabold text-accent hover:bg-[#edf6ef]">
            {reading ? <LoaderCircle size={19} className="animate-spin"/> : <UploadCloud size={19}/>}
            {reading ? "Lendo planilha..." : filename ? "Trocar planilha: " + filename : "Escolher arquivo Excel ou CSV"}
          </button>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] leading-relaxed text-[#536d60]">A planilha é lida no seu aparelho. Para localizar endereços sem coordenadas, será necessário consultar o serviço de mapas.</p>
            <a href="/modelo-destinos.csv" download="RotasGO_Modelo_Destinos.csv" className="shrink-0 text-xs font-bold text-accent underline underline-offset-2">Baixar modelo CSV</a>
          </div>
        </div>
        {error ? <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-[13px] font-medium text-red-800">{error}</p> : null}
        {message ? <p className="mt-3 rounded-xl bg-[#e9f5eb] px-4 py-3 text-[12px] font-semibold text-[#246448]">{message}</p> : null}

        {items.length ? <>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
            <div><p className="text-[14px] font-extrabold text-ink">{items.length} destinos no arquivo</p><p className="text-[11px] text-muted">{chosen.length} selecionados · {confirmed.length} localizados · {unresolved.length} precisam de revisão</p></div>
            <button type="button" disabled={resolving || !chosen.some(item => !item.confirmed && !item.error)} onClick={() => void resolveAll()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-[12px] font-bold text-white disabled:opacity-40"><Search size={15}/>{resolving ? "Localizando..." : "Localizar endereços"}</button>
          </div>
          <div className="mt-3 flex gap-2">
            {([["all","Todos"],["pending","Pendentes"],["ready","Localizados"]] as const).map(([value,label]) =>
              <button type="button" key={value} onClick={() => setFilter(value)} className={"rounded-lg px-3 py-2 text-[11px] font-bold " + (filter === value ? "bg-ink text-white" : "bg-[#f1f5f1] text-[#506b5a]")}>{label}</button>)}
          </div>
          {capacity < 18 ? <p className="mt-3 text-[11px] text-muted">Esta rota ainda aceita {capacity} visitas. Para listas maiores, selecione um lote por vez (até 18 por rota).</p> :
            <p className="mt-3 text-[11px] text-muted">Selecione até 18 locais por rota. O restante da planilha pode ser importado em outro roteiro.</p>}
          <div className="mt-4 space-y-2.5">
            {matches.map(row => <div key={row.id} className={"rounded-xl border p-3 sm:p-4 " + (row.selected ? "border-[#b5d7bf] bg-white" : "border-[#e8eeea] bg-[#fafbfa]")}>
              <div className="flex items-start gap-3">
                <input type="checkbox" aria-label={"Selecionar " + row.name} checked={row.selected} disabled={Boolean(row.error) || (!row.selected && chosen.length >= capacity)} onChange={() => toggle(row.id)} className="mt-1.5 h-4 w-4 accent-[#11664c]"/>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="truncate text-[13px] font-extrabold text-ink">{row.name}</p><span className="text-[10px] text-muted">Linha {row.line}</span>
                    {row.error ? <span className="rounded-md bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">Corrigir na planilha</span> :
                      row.confirmed ? <span className="inline-flex items-center gap-1 rounded-md bg-[#e6f5e9] px-2 py-0.5 text-[10px] font-bold text-accent"><CheckCircle2 size={12}/> Localizado</span> :
                        row.busy ? <span className="inline-flex items-center gap-1 text-[10px] font-bold text-muted"><LoaderCircle size={12} className="animate-spin"/> Buscando</span> :
                          <span className="rounded-md bg-[#fff4e3] px-2 py-0.5 text-[10px] font-bold text-[#99651b]">Revisar endereço</span>}
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted">{row.address}</p>
                  {row.error ? <p className="mt-2 text-xs text-red-700">{row.error}</p> : null}
                  {!row.error && !row.confirmed && row.selected ? <div className="mt-3">
                    <div className="flex gap-2">
                      <input aria-label={"Pesquisar endereço de " + row.name} value={row.query} onChange={e => updateRow(row.id, current => ({ ...current, query: e.target.value }))} className="h-10 min-w-0 flex-1 rounded-lg border border-[#dce5dd] px-3 text-[12px] outline-none focus:border-accent"/>
                      <button type="button" disabled={row.busy || resolving} onClick={() => void searchRow(row)} className="inline-flex h-10 items-center gap-1 rounded-lg border border-[#c9dfcd] px-3 text-[11px] font-bold text-accent disabled:opacity-40"><Search size={14}/> Buscar</button>
                    </div>
                    {row.lookupError ? <p className="mt-2 text-[11px] text-[#9b5825]">{row.lookupError}</p> : null}
                    {row.choices.length ? <div className="mt-2 space-y-1 rounded-lg border border-[#e8ede8] p-1">
                      {row.choices.slice(0,4).map((place,index) => <button type="button" key={index} className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-[#edf6f0]" onClick={() => accept(row, place)}><MapPin size={14} className="mt-0.5 shrink-0 text-accent"/><span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-bold">{place.name}</span><span className="block truncate text-[11px] text-muted">{place.address}</span></span><Check size={14} className="mt-1 shrink-0 text-accent"/></button>)}
                    </div> : null}
                  </div> : null}
                  {row.confirmed && row.latitude === null ? <button type="button" className="mt-2 text-[11px] font-bold text-accent underline" onClick={() => updateRow(row.id, v => ({ ...v, confirmed: null }))}>Trocar ponto escolhido</button> : null}
                  {row.confirmed && row.latitude !== null ? <p className="mt-1 text-[10px] text-muted">Coordenadas fornecidas no arquivo.</p> : null}
                </div>
              </div>
            </div>)}
          </div>
        </> : <div className="py-10 text-center text-muted"><FileSpreadsheet size={34} className="mx-auto mb-3 text-[#8aaf96]"/><p className="text-sm font-semibold">Sua lista de destinos aparecerá aqui.</p></div>}
      </div>
      <div className="shrink-0 border-t border-[#e3eae3] bg-white px-4 py-4 sm:px-6">
        {items.length && unresolved.length ? <p className="mb-2 flex items-center gap-1.5 text-[11px] text-[#99651b]"><AlertCircle size={14}/> Resolva ou desmarque os {unresolved.length} destinos pendentes para continuar.</p> : null}
        <div className="flex gap-2">
          <button type="button" onClick={() => { abortRef.current?.abort(); onClose(); }} className="h-12 shrink-0 rounded-xl border border-[#dce7de] px-4 text-[12px] font-bold text-[#436254]">Cancelar</button>
          <button type="button" disabled={!valid || capacity === 0 || reading} onClick={addSelected} className="h-12 min-w-0 flex-1 rounded-xl bg-accent px-3 text-[13px] font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-45">Adicionar {confirmed.length} {confirmed.length === 1 ? "destino" : "destinos"} ao roteiro</button>
        </div>
      </div>
    </div>
  </div>;
}
