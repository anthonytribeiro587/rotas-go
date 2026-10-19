import type { Metadata, Viewport } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rotas GO | Venda mais, caminhe menos",
  description: "Planeje visitas comerciais a pé com a menor rota pelas ruas e navegação GPS em cada parada.",
  applicationName: "Rotas GO",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Rotas GO" }
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#f4f7f2" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body className="bg-canvas text-ink antialiased">{children}</body></html>;
}
