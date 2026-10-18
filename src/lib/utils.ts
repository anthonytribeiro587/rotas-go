import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function meters(value: number) {
  return value >= 1000
    ? (value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " km"
    : Math.round(value).toLocaleString("pt-BR") + " m";
}

export function duration(seconds: number) {
  const mins = Math.round(seconds / 60);
  return mins >= 60 ? Math.floor(mins / 60) + "h " + String(mins % 60).padStart(2, "0") + "min" : mins + " min";
}

export function mapsLink(p: { lat: number; lng: number }) {
  const destination = encodeURIComponent(String(p.lat) + "," + String(p.lng));
  return "https://www.google.com/maps/dir/?api=1&destination=" + destination + "&travelmode=walking";
}

export function makeId() {
  return crypto.randomUUID();
}
