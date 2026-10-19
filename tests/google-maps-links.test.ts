import { describe, it, expect } from "vitest";
import { allowedMapsLink, parseMapsLink, extractMapsUrls } from "../src/lib/google-maps-links";
describe("Links de estabelecimentos Google Maps", () => {
  const local = "https://www.google.com/maps/place/Atual+Pneus+Continental+S%C3%A3o+Leopoldo/@-29.7260054,-51.1618825,17z/data=!3m1!4b1!4m6!3m5!1s0x951942be2ff449bf:0x5af2d5a562235deb!8m2!3d-29.7260054!4d-51.1593076!16s%2Fg%2F11cr_hkmkm";
  it("usa ponto exato e não o centro do mapa", () => {
    const place = parseMapsLink(local);
    expect(place.title).toContain("Atual Pneus");
    expect(place.lat).toBeCloseTo(-29.7260054);
    expect(place.lng).toBeCloseTo(-51.1593076);
    expect(place.accurate).toBe(true);
  });
  it("não assume que a coordenada da câmera é o local", () => {
    const place = parseMapsLink("https://www.google.com/maps/place/Loja+Teste/@-29.7,-51.1,16z");
    expect(place.accurate).toBe(false);
    expect(place.lat).toBeNull();
  });
  it("aceita coordenadas explícitas na busca", () => {
    const place = parseMapsLink("https://www.google.com/maps/search/?api=1&query=-29.81%2C-51.16");
    expect(place.accurate).toBe(true);
    expect(place.lat).toBeCloseTo(-29.81);
  });
  it("não adivinha localização pelo nome da loja", () => {
    const place = parseMapsLink("https://www.google.com/maps/search/?api=1&query=Loja+do+Centro");
    expect(place.accurate).toBe(false);
    expect(place.title).toBe("Loja do Centro");
  });
  it("rejeita SSRF e host parecido", () => {
    for (const url of ["http://maps.app.goo.gl/x", "https://maps.app.goo.gl.evil.com/abc", "https://localhost/maps/place/test", "https://127.0.0.1/maps/place/test", "https://google.com@evil.test/maps", "https://goo.gl/not-maps"]) {
      expect(() => allowedMapsLink(url)).toThrow();
    }
  });
  it("extrai e elimina links repetidos de mensagens", () => {
    expect(extractMapsUrls("Loja 1 https://maps.app.goo.gl/abc\nLoja 2 https://maps.app.goo.gl/abc\nLoja 3 https://www.google.com/maps/place/Lebes")).toHaveLength(2);
  });
});
