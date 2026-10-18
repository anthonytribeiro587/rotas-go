"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { User } from "@supabase/supabase-js";
import {
  ArrowDownRight, ArrowRight, Check, CheckCheck, ChevronLeft, Clock3,
  Compass, Footprints, GripVertical, History, LocateFixed, LogIn,
  LogOut, MapPin, Navigation2, Plus, RotateCcw, Route, Save,
  ShieldCheck, Sparkles, Trash2, X
} from "lucide-react";
import {
  closestCenter, DndContext, KeyboardSensor, PointerSensor, TouchSensor,
  useSensor, useSensors, type DragEndEvent
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { LocationSearch } from "@/components/location-search";
import { supabase } from "@/lib/supabase";
import { cn, duration, makeId, mapsLink, meters } from "@/lib/utils";
import type { Optimization, Point, SavedPlan, SearchResult, Visit, VisitStatus } from "@/lib/types";

const RouteMap = dynamic(() => import("./route-map"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center bg-[#e2ece4] text-sm font-bold text-accent">Carregando mapa...</div>
});
const STORAGE_DRAFT = "rotas-go-draft-v1";
const STORAGE_HISTORY = "rotas-go-history-v1";
type Page = "plan" | "history";

function StopRow({
  stop, index, isNext, onStatus, onRemove
}: {
  stop: Visit;
  index: number;
  isNext: boolean;
  onStatus: (id: string, status: VisitStatus) => void;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stop.id });
  return <div
    ref={setNodeRef}
    style={{ transform: CSS.Transform.toString(transform), transition }}
    className={cn(
      "sortable-item relative flex items-center gap-3 rounded-2xl border bg-white px-3 py-3",
      isNext ? "border-[#b5d3b5] shadow-sm" : "border-line",
      isDragging && "z-50 shadow-float",
      stop.status !== "pending" && "opacity-70"
    )}
  >
    <button
      {...attributes} {...listeners}
      className="drag-handle flex h-11 w-6 shrink-0 items-center justify-center text-[#a0b2a5]"
      type="button" title="Arrastar para alterar a ordem"
      aria-label={"Reordenar " + stop.name}
    ><GripVertical size={18} /></button>
    <span className={cn(
      "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-black",
      stop.status === "visited" ? "bg-[#e7f4dc] text-accent" :
      stop.status === "skipped" ? "bg-[#f4eee0] text-[#976a32]" :
      isNext ? "bg-accent text-white" : "bg-canvas text-ink"
    )}>{stop.status === "visited" ? <Check size={19} strokeWidth={3} /> : index + 1}</span>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5">
        <p className="truncate text-sm font-extrabold">{stop.name}</p>
        {isNext ? <span className="shrink-0 rounded-full bg-[#e3f3d7] px-2 py-0.5 text-[9px] font-extrabold uppercase text-accent">Próximo</span> : null}
      </div>
      <p className="mt-0.5 truncate text-[11px] text-muted">{stop.address}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <a href={mapsLink(stop)} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1 rounded-xl bg-[#e9f4e8] px-3 text-xs font-extrabold text-accent hover:bg-[#d6ebd6]">
          <Navigation2 size={13} fill="currentColor" /> Navegar
        </a>
        <button type="button" onClick={() => onStatus(stop.id, stop.status === "visited" ? "pending" : "visited")}
          className="inline-flex h-9 items-center gap-1 rounded-xl bg-canvas px-3 text-xs font-bold text-ink">
          <Check size={13} /> {stop.status === "visited" ? "Desfazer" : "Visitei"}
        </button>
        <button type="button" onClick={() => onRemove(stop.id)} aria-label={"Remover " + stop.name}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>
      </div>
    </div>
  </div>;
}

export default function RoutePlanner() {
  const [start, setStart] = useState<Point | null>(null);
  const [end, setEnd] = useState<Point | null>(null);
  const [stops, setStops] = useState<Visit[]>([]);
  const [optimization, setOptimization] = useState<Optimization | null>(null);
  const [manual, setManual] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedRouteId, setSavedRouteId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState<Page>("plan");
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [showAccount, setShowAccount] = useState(false);
  const [email, setEmail] = useState("");
  const [history, setHistory] = useState<SavedPlan[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 170, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    try {
      const draft = localStorage.getItem(STORAGE_DRAFT);
      if (draft) {
        const parsed = JSON.parse(draft);
        setStart(parsed.start ?? null);
        setEnd(parsed.end ?? null);
        setStops(Array.isArray(parsed.stops) ? parsed.stops : []);
        setOptimization(parsed.optimization ?? null);
        setManual(Boolean(parsed.manual));
        setSavedRouteId(parsed.savedRouteId ?? null);
      }
    } catch { /* rascunho local inválido não impede uso */ }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(STORAGE_DRAFT, JSON.stringify({ start, end, stops, optimization, manual, savedRouteId })); }
    catch { /* navegador pode bloquear armazenamento privado */ }
  }, [ready, start, end, stops, optimization, manual, savedRouteId]);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setUser(data.user)).catch(() => {});
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  const completed = stops.filter((s) => s.status === "visited").length;
  const next = stops.find((s) => s.status === "pending") || (optimization ? end : null);
  const mapCenter = start || stops[0] || end || null;
  const canOptimize = Boolean(start && end && stops.length && !isOptimizing);
  const stopsIds = useMemo(() => stops.map((s) => s.id), [stops]);

  function clearComputed() {
    setOptimization(null);
    setManual(false);
    setSavedRouteId(null);
  }
  function setPoint(which: "start" | "end", item: SearchResult) {
    const point = { ...item, id: makeId() };
    if (which === "start") setStart(point);
    else setEnd(point);
    clearComputed();
    setNotice("");
  }
  function addStop(item: SearchResult) {
    if (stops.length >= 18) { setNotice("Limite do MVP: 18 visitas por rota."); return; }
    if (stops.some((s) => Math.abs(s.lat - item.lat) < 0.000001 && Math.abs(s.lng - item.lng) < 0.000001)) {
      setNotice("Este local já está nas visitas de hoje.");
      return;
    }
    setStops((v) => [...v, { ...item, id: makeId(), status: "pending" }]);
    clearComputed();
    setNotice("");
  }
  function removeStop(id: string) {
    setStops((v) => v.filter((s) => s.id !== id));
    clearComputed();
  }
  function useMyLocation() {
    if (!navigator.geolocation) { setNotice("Este navegador não suporta localização GPS."); return; }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setStart({
          id: makeId(),
          name: "Minha localização",
          address: "Posição atual do celular",
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
        clearComputed();
        setNotice("Partida definida pela sua localização.");
      },
      () => setNotice("Não foi possível obter o GPS. Autorize a localização no navegador."),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 12000 }
    );
  }

  async function calculate(nextStops = stops, keepOrder = false) {
    if (!start || !end || nextStops.length === 0) { setNotice("Defina partida, destino final e pelo menos uma visita."); return; }
    setIsOptimizing(true);
    setOptimization(null);
    setSavedRouteId(null);
    setNotice("");
    try {
      const response = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start, end, stops: nextStops, mode: keepOrder ? "manual" : "optimize" })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Erro no serviço de roteamento.");
      const optimized: Optimization = {
        order: result.order, geometry: result.geometry,
        distanceMeters: result.distanceMeters, durationSeconds: result.durationSeconds, exact: result.exact
      };
      setStops(result.order.map((index: number) => nextStops[index]));
      setOptimization(optimized);
      setManual(keepOrder);
      setNotice(keepOrder
        ? "Ordem manual aplicada e percurso atualizado."
        : result.exact
          ? "Melhor sequência matemática encontrada para estas visitas."
          : "Sequência eficiente calculada por aproximação.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível calcular a rota.");
    } finally { setIsOptimizing(false); }
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = stops.findIndex((x) => x.id === active.id);
    const to = stops.findIndex((x) => x.id === over.id);
    if (from < 0 || to < 0) return;
    const reordered = arrayMove(stops, from, to);
    setStops(reordered);
    clearComputed();
    if (start && end) void calculate(reordered, true);
    else setNotice("Nova ordem aplicada. Defina partida e chegada para desenhar o trajeto.");
  }

  async function markStatus(id: string, status: VisitStatus) {
    setStops((v) => v.map((s) => s.id === id ? { ...s, status } : s));
    if (supabase && user && savedRouteId) {
      const { error } = await supabase.from("route_stops")
        .update({ status, visited_at: status === "visited" ? new Date().toISOString() : null })
        .eq("route_id", savedRouteId).eq("client_key", id);
      if (error) setNotice("Visita atualizada neste aparelho, mas não sincronizada: " + error.message);
    }
  }

  async function savePlan() {
    if (!start || !end || !optimization) { setNotice("Calcule a rota antes de salvar."); return; }
    if (savedRouteId) { setNotice("Esta rota já está salva."); return; }
    setIsSaving(true);
    try {
      const plan: SavedPlan = { id: makeId(), createdAt: new Date().toISOString(), start, end, stops, optimization };
      if (supabase && user) {
        const { data, error } = await supabase.from("routes").insert({
          user_id: user.id, start_point: start, end_point: end,
          geometry: optimization.geometry, distance_meters: optimization.distanceMeters,
          duration_seconds: optimization.durationSeconds, exact: optimization.exact
        }).select("id").single();
        if (error) throw error;
        const routeId = data.id as string;
        const { error: stopError } = await supabase.from("route_stops").insert(
          stops.map((s, i) => ({
            route_id: routeId, user_id: user.id, client_key: s.id, name: s.name, address: s.address,
            lat: s.lat, lng: s.lng, position: i, status: s.status,
            visited_at: s.status === "visited" ? new Date().toISOString() : null
          }))
        );
        if (stopError) {
          await supabase.from("routes").delete().eq("id", routeId);
          throw stopError;
        }
        setSavedRouteId(routeId);
        setNotice("Rota salva com segurança na sua conta.");
      } else {
        const existing: SavedPlan[] = JSON.parse(localStorage.getItem(STORAGE_HISTORY) || "[]");
        localStorage.setItem(STORAGE_HISTORY, JSON.stringify([plan, ...existing].slice(0, 30)));
        setSavedRouteId(plan.id);
        setNotice("Rota salva neste aparelho. Entre na conta para sincronizar na nuvem.");
      }
    } catch (e) {
      setNotice("Erro ao salvar a rota: " + (e instanceof Error ? e.message : "tente novamente"));
    } finally { setIsSaving(false); }
  }

  async function openHistory() {
    setPage("history");
    setHistoryBusy(true);
    try {
      if (supabase && user) {
        const { data, error } = await supabase.from("routes")
          .select("id, created_at, start_point, end_point, geometry, distance_meters, duration_seconds, exact, route_stops(client_key, name, address, lat, lng, position, status)")
          .order("created_at", { ascending: false }).limit(30);
        if (error) throw error;
        const plans: SavedPlan[] = (data || []).map((row: any) => ({
          id: row.id, createdAt: row.created_at, start: row.start_point, end: row.end_point,
          stops: (row.route_stops || []).sort((a: any, b: any) => a.position - b.position)
            .map((s: any) => ({ id: s.client_key, name: s.name, address: s.address, lat: s.lat, lng: s.lng, status: s.status })),
          optimization: row.geometry ? {
            order: (row.route_stops || []).map((_: unknown, i: number) => i),
            geometry: row.geometry, distanceMeters: row.distance_meters,
            durationSeconds: row.duration_seconds, exact: row.exact
          } : null
        }));
        setHistory(plans);
      } else {
        setHistory(JSON.parse(localStorage.getItem(STORAGE_HISTORY) || "[]"));
      }
    } catch (e) {
      setNotice("Erro ao carregar histórico: " + (e instanceof Error ? e.message : "tente novamente"));
    } finally { setHistoryBusy(false); }
  }

  function loadPlan(plan: SavedPlan) {
    setStart(plan.start); setEnd(plan.end); setStops(plan.stops);
    setOptimization(plan.optimization);
    setManual(!plan.optimization?.exact);
    setSavedRouteId(plan.id);
    setPage("plan");
    setNotice("Rota recuperada do histórico.");
  }

  async function sendMagicLink() {
    if (!supabase) { setNotice("Configure as variáveis públicas do Supabase primeiro."); return; }
    if (!email.includes("@")) { setNotice("Informe um e-mail válido."); return; }
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin } });
    setNotice(error ? "Erro ao enviar acesso: " + error.message : "Enviamos um link de acesso para seu e-mail.");
    if (!error) setShowAccount(false);
  }

  return <div className="app-shell min-h-dvh bg-canvas">
    <header className="relative z-[1200] flex h-[76px] items-center justify-between border-b border-line bg-white px-5 sm:px-8">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-accent text-white shadow-sm"><Route size={22} strokeWidth={2.5} /></div>
        <div><div className="flex items-baseline gap-1"><span className="text-xl font-black tracking-[-.055em]">rotas</span><span className="text-xl font-black tracking-[-.055em] text-accent">GO</span><span className="ml-1 rounded-md bg-lime px-1.5 py-0.5 text-[9px] font-black tracking-wider">BETA</span></div><p className="text-[10px] font-semibold tracking-wide text-muted">CAMINHE MENOS. VENDA MAIS.</p></div>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => void openHistory()} className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-white text-ink hover:bg-canvas" aria-label="Abrir histórico"><History size={20} /></button>
        <button type="button" onClick={() => setShowAccount(!showAccount)} className="flex h-11 items-center gap-2 rounded-xl bg-ink px-3 text-xs font-bold text-white" aria-label="Conta do usuário">
          {user ? <ShieldCheck size={17} /> : <LogIn size={17} />}<span className="hidden sm:inline">{user ? "Minha conta" : "Entrar"}</span>
        </button>
      </div>
      {showAccount ? <div className="absolute right-4 top-[68px] z-[1200] w-[min(340px,calc(100vw-32px))] rounded-2xl border border-line bg-white p-4 shadow-float">
        <div className="mb-3 flex items-center justify-between"><p className="font-extrabold">Minha conta</p><button type="button" aria-label="Fechar" onClick={() => setShowAccount(false)}><X size={18} /></button></div>
        {user ? <><p className="mb-3 break-all text-xs text-muted">{user.email}</p><Button variant="outline" className="w-full" onClick={async () => { await supabase?.auth.signOut(); setShowAccount(false); }}><LogOut size={16} /> Sair</Button></> :
          supabase ? <><p className="mb-3 text-xs leading-relaxed text-muted">Entre por link enviado por e-mail para salvar e sincronizar rotas.</p><input className="mb-3 h-12 w-full rounded-xl border border-line px-3 text-sm outline-none focus:border-accent" type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} /><Button className="w-full" onClick={() => void sendMagicLink()}>Enviar link de acesso</Button></> :
            <p className="text-xs leading-relaxed text-muted">Modo local ativo. Configure Supabase para habilitar login e armazenamento em nuvem.</p>}
      </div> : null}
    </header>

    <main className="planner-layout">
      <section className="map-panel" aria-label="Mapa do percurso">
        <RouteMap start={start} end={end} stops={stops} geometry={optimization?.geometry || []} />
        <div className="pointer-events-none absolute left-4 top-5 z-[500] rounded-2xl border border-white/80 bg-white/95 px-3 py-2 shadow-sm">
          <div className="flex items-center gap-2 text-[11px] font-extrabold"><span className="h-2 w-2 rounded-full bg-accent" /> MAPA DO PERCURSO</div>
          <p className="mt-0.5 text-[10px] text-muted">{optimization ? "Rota pelas ruas" : "Adicione locais para começar"}</p>
        </div>
        {optimization ? <div className="pointer-events-none absolute right-4 top-5 z-[500] flex items-center gap-2 rounded-2xl bg-ink px-3 py-2 text-xs font-bold text-white shadow-lg"><Footprints size={15} /> {meters(optimization.distanceMeters)}</div> : null}
        <div className="pointer-events-none absolute bottom-9 left-4 z-[500] flex items-center gap-2 rounded-xl bg-white/95 px-2.5 py-1.5 text-[10px] font-bold text-muted"><span className="h-2 w-2 rounded-full bg-ink" /> Início <span className="ml-1 h-2 w-2 rounded-full bg-accent" /> Visitas <span className="ml-1 h-2 w-2 rounded-full bg-[#e19c41]" /> Fim</div>
      </section>

      <section className="sheet">
        <div className="mx-auto max-w-[660px] px-5 pb-5 pt-6 sm:px-8 lg:pt-8">
          {page === "history" ? <>
            <button type="button" onClick={() => setPage("plan")} className="mb-5 flex items-center gap-1 text-sm font-bold text-accent"><ChevronLeft size={20} /> Voltar ao planejamento</button>
            <div className="mb-6"><span className="text-[11px] font-extrabold uppercase tracking-[.17em] text-accent">Suas jornadas</span><h1 className="mt-1 text-[28px] font-black tracking-[-.055em]">Histórico de rotas</h1><p className="mt-1 text-sm text-muted">Retome um roteiro salvo para continuar suas visitas.</p></div>
            {historyBusy ? <p className="py-8 text-center text-sm text-muted">Carregando rotas...</p> : history.length ? <div className="space-y-3">
              {history.map((plan) => <button type="button" key={plan.id} onClick={() => loadPlan(plan)} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-white p-4 text-left hover:border-accent">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#e9f4e8] text-accent"><Route size={21} /></div>
                <div className="min-w-0 flex-1"><p className="text-sm font-extrabold">{new Date(plan.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}</p><p className="mt-0.5 truncate text-xs text-muted">{plan.stops.length} visitas · {plan.optimization ? meters(plan.optimization.distanceMeters) : "Sem cálculo"}</p><p className="mt-1 truncate text-[11px] text-muted">{plan.start.name} → {plan.end.name}</p></div><ArrowRight className="shrink-0 text-accent" size={18} />
              </button>)}
            </div> : <div className="rounded-2xl border border-dashed border-line bg-canvas px-5 py-10 text-center"><History className="mx-auto mb-3 text-muted" size={27} /><p className="font-bold">Nenhuma rota salva ainda</p><p className="mt-1 text-sm text-muted">Seu histórico aparecerá aqui.</p></div>}
          </> : <>
            <div className="mb-5">
              <div className="mb-2 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-accent" /><span className="text-[11px] font-black uppercase tracking-[.15em] text-accent">Seu dia mais inteligente</span></div>
              <h1 className="max-w-[540px] text-[27px] font-black leading-[1.15] tracking-[-.055em] sm:text-[31px]">Cada visita conta. <span className="text-accent">Cada passo também.</span></h1>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">Monte suas visitas e descubra o melhor caminho a pé.</p>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-line bg-[#f8faf7] px-3 py-3"><div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-muted"><MapPin size={13} /> Paradas</div><div className="mt-1 text-[23px] font-black leading-none">{stops.length}<span className="ml-1 text-xs font-semibold text-muted">locais</span></div></div>
              <div className="rounded-2xl border border-line bg-[#f8faf7] px-3 py-3"><div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-muted"><Clock3 size={13} /> Caminhada</div><div className="mt-1 text-[23px] font-black leading-none">{optimization ? duration(optimization.durationSeconds) : "—"}</div></div>
            </div>

            <div className="rounded-[22px] border border-line bg-white p-3 shadow-sm sm:p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <LocationSearch label="01 · Ponto de partida" placeholder="De onde você vai sair?" current={start} center={mapCenter} allowGeolocation onGeolocation={useMyLocation} onPick={(item) => setPoint("start", item)} />
                <LocationSearch label="02 · Ponto final" placeholder="Onde você quer terminar?" current={end} center={mapCenter} onPick={(item) => setPoint("end", item)} />
              </div>
            </div>

            <div className="mt-6 mb-3 flex items-end justify-between">
              <div><p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-accent">Seu roteiro</p><h2 className="mt-0.5 text-xl font-black tracking-[-.04em]">Visitas de hoje <span className="ml-1 text-sm text-muted">({stops.length})</span></h2></div>
              {stops.length ? <span className="rounded-full bg-[#eaf4e7] px-2.5 py-1 text-[11px] font-extrabold text-accent">{completed}/{stops.length} feitas</span> : null}
            </div>
            {stops.length ? <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-[#e9efe8]"><div className="h-full rounded-full bg-accent transition-all" style={{ width: (completed / stops.length * 100) + "%" }} /></div> : null}

            <div className="mb-4 rounded-2xl border border-dashed border-[#b4d0b6] bg-[#f5faf3] p-3">
              <LocationSearch label="Adicionar estabelecimento" placeholder="Nome da loja, rua ou endereço..." center={mapCenter} onPick={addStop} />
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted"><Plus size={13} /> Busque, selecione e adicione até 18 locais.</div>
            </div>

            {optimization && next ? <div className="mb-4 flex items-center gap-3 rounded-2xl bg-ink p-3.5 text-white">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-lime text-ink"><Compass size={21} /></div>
              <div className="min-w-0 flex-1"><p className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-[#c8d8cd]">{completed === stops.length ? "Rota concluída · vá ao destino final" : "Sua próxima parada"}</p><p className="truncate text-sm font-extrabold">{next.name}</p></div>
              <a className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-ink" href={mapsLink(next)} target="_blank" rel="noopener noreferrer" aria-label={"Navegar para " + next.name}><Navigation2 size={20} fill="currentColor" /></a>
            </div> : null}

            {stops.length ? <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={stopsIds} strategy={verticalListSortingStrategy}>
                <div className="space-y-2.5">{stops.map((stop, index) => <StopRow key={stop.id} stop={stop} index={index} isNext={next?.id === stop.id && stop.status === "pending"} onStatus={(id, status) => void markStatus(id, status)} onRemove={removeStop} />)}</div>
              </SortableContext>
            </DndContext> : <div className="rounded-2xl border border-dashed border-line bg-canvas px-6 py-9 text-center"><div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e5f0e3] text-accent"><Footprints size={25} /></div><p className="font-extrabold">Sua rota começa aqui</p><p className="mx-auto mt-1 max-w-[270px] text-xs leading-relaxed text-muted">Adicione as lojas e estabelecimentos que deseja visitar hoje.</p></div>}

            {optimization ? <div className="mt-4 rounded-2xl border border-line bg-canvas p-4">
              <div className="grid grid-cols-3 gap-3 text-center"><div><p className="text-[10px] font-bold uppercase text-muted">Distância</p><p className="mt-1 text-base font-black">{meters(optimization.distanceMeters)}</p></div><div className="border-x border-line"><p className="text-[10px] font-bold uppercase text-muted">A pé</p><p className="mt-1 text-base font-black">{duration(optimization.durationSeconds)}</p></div><div><p className="text-[10px] font-bold uppercase text-muted">Método</p><p className="mt-1 text-[12px] font-black">{manual ? "Manual" : optimization.exact ? "TSP exato" : "Heurístico"}</p></div></div>
              <p className="mt-3 text-center text-[10px] text-muted">Tempo estimado de caminhada, sem o atendimento nos clientes.</p>
            </div> : null}
            <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted"><GripVertical size={12} /> Segure e arraste uma visita para alterar a ordem.</p>
          </>}
        </div>
      </section>
    </main>

    {page === "plan" ? <div className="safe-bottom fixed inset-x-0 bottom-0 z-[1100] border-t border-line bg-white/95 px-5 pt-3 shadow-[0_-9px_35px_rgba(15,42,30,.09)] backdrop-blur-xl lg:right-auto lg:w-[46%] lg:max-w-[770px]">
      <div className="mx-auto flex max-w-[630px] items-center gap-2">
        <Button variant="primary" size="lg" className="min-w-0 flex-1 rounded-2xl shadow-sm" disabled={!canOptimize} onClick={() => void calculate()}>
          {isOptimizing ? <><RotateCcw className="animate-spin" size={19} /> Calculando...</> : <><Sparkles size={19} /> Otimizar rota <ArrowDownRight size={19} /></>}
        </Button>
        <Button variant="outline" size="icon" className="h-14 w-14 shrink-0 rounded-2xl" aria-label="Salvar rota" title="Salvar rota" disabled={!optimization || isSaving || Boolean(savedRouteId)} onClick={() => void savePlan()}>
          {savedRouteId ? <CheckCheck size={21} className="text-accent" /> : <Save size={21} />}
        </Button>
      </div>
      <p className="mt-1.5 text-center text-[10px] text-muted">{savedRouteId ? "Rota salva" : optimization ? "Pronta para começar: salve e abra o GPS em cada visita." : "Ponto de partida e chegada permanecem fixos."}</p>
    </div> : null}

    {notice ? <div role="status" className="fixed bottom-[114px] left-1/2 z-[1500] flex w-[min(480px,calc(100vw-32px))] -translate-x-1/2 items-start gap-3 rounded-2xl bg-ink px-4 py-3 text-white shadow-float lg:bottom-7">
      <p className="flex-1 text-xs font-semibold leading-relaxed">{notice}</p><button type="button" onClick={() => setNotice("")} aria-label="Fechar aviso"><X size={18} /></button>
    </div> : null}
  </div>;
}
