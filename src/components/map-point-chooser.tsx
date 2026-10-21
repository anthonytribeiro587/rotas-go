"use client";
import { useEffect, useState } from "react";
import { Check, LoaderCircle, MapPin, Navigation2, RotateCcw, X } from "lucide-react";
import type { SearchResult } from "@/lib/types";

type Suggestion = SearchResult & { distanceMeters: number };
type Purpose = "visit" | "start" | "end";
type Props = {
  lat: number; lng: number;
  onConfirm: (point: SearchResult, purpose: Purpose) => void;
  onAnother: () => void; onClose: () => void;
};
export default function MapPointChooser({lat,lng,onConfirm,onAnother,onClose}:Props) {
  const [suggestions,setSuggestions]=useState<Suggestion[]>([]);
  const [selected,setSelected]=useState<Suggestion|null>(null);
  const [address,setAddress]=useState("");
  const [name,setName]=useState("");
  const [purpose,setPurpose]=useState<Purpose>("visit");
  const [busy,setBusy]=useState(true);
  const [warning,setWarning]=useState("");
  useEffect(()=>{
    const controller=new AbortController();
    setSuggestions([]);setSelected(null);setName("");setBusy(true);setWarning("");setAddress("");
    fetch("/api/map-pick?"+new URLSearchParams({lat:String(lat),lng:String(lng)}),{signal:controller.signal})
      .then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error||"Consulta indisponível");
        setSuggestions(Array.isArray(data.places)?data.places:[]);
        setAddress(typeof data.address==="string"?data.address:"");
        if(data.warning)setWarning(data.warning);
      }).catch(e=>{if(!controller.signal.aborted)setWarning(e.message||"Não foi possível buscar locais próximos.");})
      .finally(()=>{if(!controller.signal.aborted)setBusy(false)});
    return ()=>controller.abort();
  },[lat,lng]);
  function confirm(){
    const title=name.trim();if(!title)return;
    const point=selected||{lat,lng,address:address||"Ponto do mapa: "+lat.toFixed(5)+", "+lng.toFixed(5)};
    onConfirm({name:title,address:point.address||address||title,lat:point.lat,lng:point.lng},purpose);
  }
  return <div role="dialog" aria-modal="true" aria-label="Escolher local no mapa" className="fixed inset-0 z-[1700] flex items-end justify-center bg-[#102f22]/50 sm:items-center sm:px-4">
    <div className="flex max-h-[min(89dvh,720px)] w-full max-w-[510px] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
      <div className="flex shrink-0 items-center gap-3 border-b border-[#e3ece5] p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e6f4e9] text-accent"><MapPin size={19}/></div>
        <div className="min-w-0 flex-1"><h2 className="text-[16px] font-extrabold text-ink">Selecionar estabelecimento</h2><p className="mt-0.5 text-[11px] text-muted">Escolha a loja próxima ou use o ponto tocado.</p></div>
        <button type="button" aria-label="Fechar seleção" className="flex h-10 w-10 items-center justify-center rounded-xl border border-line text-muted" onClick={onClose}><X size={18}/></button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {address?<div className="rounded-xl bg-[#f5f9f5] px-3 py-2 text-[11px] leading-relaxed text-[#597366]">{address}</div>:null}
        {busy?<div className="flex items-center gap-2 py-4 text-[12px] text-muted"><LoaderCircle size={17} className="animate-spin"/> Procurando estabelecimentos próximos...</div>:null}
        {!busy&&suggestions.length ? <>
          <p className="text-[12px] font-extrabold">Lojas próximas ao ponto tocado</p>
          <div className="space-y-1.5">
            {suggestions.map((p,i)=><button type="button" key={p.name+"-"+i} onClick={()=>{setSelected(p);setName(p.name);}} className={"flex w-full min-h-14 items-center gap-2 rounded-xl border px-3 py-2.5 text-left "+(selected===p?"border-accent bg-[#ebf6ee]":"border-[#e0e9e2] hover:bg-[#f6faf6]")}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#e9f4eb] text-accent">{selected===p?<Check size={16}/>:<MapPin size={16}/>}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-extrabold">{p.name}</span><span className="block truncate text-[10px] text-muted">{p.address}</span></span><span className="shrink-0 text-[11px] font-bold text-muted">{p.distanceMeters} m</span>
            </button>)}
          </div>
        </>:null}
        {!busy&&!suggestions.length?<p className="text-[12px] text-muted">Não encontrei lojas cadastradas próximas. Você pode adicionar exatamente a localização marcada.</p>:null}
        {warning?<p className="rounded-lg bg-[#fff5e5] p-3 text-[11px] text-[#896130]">{warning}</p>:null}
        <button type="button" onClick={()=>{setSelected(null);setName("");}} className={"flex w-full items-center gap-2 rounded-xl border px-3 py-3 text-left text-[12px] font-bold "+(!selected?"border-accent bg-[#ebf6ee] text-accent":"border-line text-muted")}><Navigation2 size={15}/> Usar o ponto exato que toquei ({lat.toFixed(5)}, {lng.toFixed(5)})</button>
        <div><label htmlFor="map-point-name" className="mb-1 block text-[12px] font-bold text-ink">Nome do local</label>
          <input id="map-point-name" maxLength={120} placeholder="Ex.: Loja Centro, cliente João..." value={name} onChange={e=>setName(e.target.value)} className="h-12 w-full rounded-xl border border-line bg-[#fafcfa] px-3 text-[13px] outline-none focus:border-accent"/>
        </div>
        <fieldset><legend className="mb-2 text-[12px] font-bold text-ink">Adicionar como</legend>
          <div className="grid grid-cols-3 gap-2">{([["visit","Visita"],["start","Partida"],["end","Chegada"]] as const).map(([role,title])=><button type="button" key={role} onClick={()=>setPurpose(role)} aria-pressed={purpose===role} className={"h-10 rounded-xl border text-[12px] font-bold "+(purpose===role?"border-accent bg-[#e9f6eb] text-accent":"border-line text-muted")}>{title}</button>)}</div>
        </fieldset>
        <p className="text-[10px] leading-relaxed text-muted">As placas e nomes são desenhos do mapa. As lojas próximas são sugestões; confirme a posição correta. Dados: <a href="https://www.geoapify.com/" target="_blank" rel="noopener noreferrer" className="underline">Geoapify</a>.</p>
      </div>
      <div className="flex shrink-0 gap-2 border-t border-[#e4ebe5] bg-white p-4">
        <button type="button" onClick={onAnother} className="flex h-12 items-center gap-1.5 rounded-xl border border-line px-3 text-xs font-bold text-[#54705c]"><RotateCcw size={14}/> Outro ponto</button>
        <button type="button" onClick={confirm} disabled={!name.trim()} className="h-12 flex-1 rounded-xl bg-accent px-4 text-[13px] font-extrabold text-white disabled:opacity-40">Confirmar {purpose==="visit"?"visita":purpose==="start"?"partida":"chegada"}</button>
      </div>
    </div>
  </div>;
}
