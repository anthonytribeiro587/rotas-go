import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type Feature = {
  properties?: { name?: string; formatted?: string; address_line1?: string; address_line2?: string; lat?: number; lon?: number };
  geometry?: { coordinates?: number[] };
};
type Candidate = { name: string; address: string; lat: number; lng: number; distanceMeters: number };
const cache = new Map<string,{at:number,places:Candidate[],address:string}>();
const usage = new Map<string,{at:number,count:number}>();
function distance(lat:number,lng:number,pLat:number,pLng:number) {
  const rad=Math.PI/180,dLat=(pLat-lat)*rad,dLng=(pLng-lng)*rad;
  const a=Math.sin(dLat/2)**2+Math.cos(lat*rad)*Math.cos(pLat*rad)*Math.sin(dLng/2)**2;
  return Math.round(12742000*Math.asin(Math.min(1,Math.sqrt(a))));
}
async function query(url:URL) {
  const response=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(7000)});
  if(!response.ok)throw new Error("Geoapify "+response.status);
  return response.json() as Promise<{features?:Feature[];results?:{formatted?:string;address_line1?:string}[]}>;
}
export async function GET(request:NextRequest) {
  const p=request.nextUrl.searchParams,rawLat=p.get("lat"),rawLng=p.get("lng");
  const lat=Number(rawLat),lng=Number(rawLng);
  if(!rawLat||!rawLng||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180||(lat===0&&lng===0))
    return NextResponse.json({error:"Coordenadas inválidas."},{status:400});
  const apiKey=process.env.GEOAPIFY_API_KEY;
  if(!apiKey)return NextResponse.json({places:[],address:"",provider:"manual"});
  const id=lat.toFixed(4)+","+lng.toFixed(4),now=Date.now();
  const existing=cache.get(id);
  if(existing&&now-existing.at<300000)return NextResponse.json({places:existing.places,address:existing.address,provider:"geoapify"});
  const ip=request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"local";
  const old=usage.get(ip),v=old&&now-old.at<60000?{at:old.at,count:old.count+1}:{at:now,count:1};
  usage.set(ip,v);if(usage.size>500)usage.clear();
  if(v.count>20)return NextResponse.json({error:"Muitas consultas. Aguarde um minuto."},{status:429});
  const pois=new URL("https://api.geoapify.com/v2/places");
  pois.searchParams.set("categories","commercial,catering,healthcare");
  pois.searchParams.set("filter","circle:"+lng+","+lat+",100");
  pois.searchParams.set("bias","proximity:"+lng+","+lat);
  pois.searchParams.set("limit","16");
  pois.searchParams.set("apiKey",apiKey);
  pois.searchParams.set("lang","pt");
  const reverse=new URL("https://api.geoapify.com/v1/geocode/reverse");
  reverse.searchParams.set("lat",String(lat));reverse.searchParams.set("lon",String(lng));
  reverse.searchParams.set("format","json");reverse.searchParams.set("lang","pt");reverse.searchParams.set("limit","1");reverse.searchParams.set("apiKey",apiKey);
  const [poisResult,reverseResult]=await Promise.allSettled([query(pois),query(reverse)]);
  if(poisResult.status==="rejected"&&reverseResult.status==="rejected")
    return NextResponse.json({places:[],address:"",provider:"manual",warning:"Não foi possível buscar estabelecimentos próximos. Você ainda pode adicionar o ponto manualmente."});
  const unique=new Set<string>();
  const points:Candidate[]=(poisResult.status==="fulfilled"?poisResult.value.features||[]:[]).map(f=>{
    const prop=f.properties||{},coordinates=f.geometry?.coordinates||[];
    const plat=Number.isFinite(prop.lat)?prop.lat!:coordinates[1],plng=Number.isFinite(prop.lon)?prop.lon!:coordinates[0];
    if(!prop.name?.trim()||!Number.isFinite(plat)||!Number.isFinite(plng))return null;
    const meters=distance(lat,lng,plat,plng);
    if(meters>110)return null;
    return {name:prop.name.trim().slice(0,120),address:(prop.formatted||[prop.address_line1,prop.address_line2].filter(Boolean).join(" · ")||prop.name).slice(0,260),lat:plat,lng:plng,distanceMeters:meters};
  }).filter((item):item is Candidate=>item!==null).sort((a,b)=>a.distanceMeters-b.distanceMeters)
   .filter(item=>{
     const k=item.name.toLowerCase()+"|"+item.lat.toFixed(5)+"|"+item.lng.toFixed(5);
     if(unique.has(k))return false;
     unique.add(k);return true;
   }).slice(0,7);
  const address=(reverseResult.status==="fulfilled"?(reverseResult.value.results?.[0]?.formatted||reverseResult.value.results?.[0]?.address_line1):"")||"";
  if(cache.size>300)cache.clear();
  cache.set(id,{at:now,places:points,address:address.slice(0,250)});
  return NextResponse.json({places:points,address:address.slice(0,250),provider:"geoapify"},{headers:{"Cache-Control":"private, no-store"}});
}
