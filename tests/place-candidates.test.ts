import { describe, expect, it, vi } from "vitest";
import { selectCandidate } from "../src/lib/place-candidates";
describe("Seleção de lugares Google", () => {
  it("não chama detalhes para candidatos já geocodificados", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const place = { name: "Lago", address: "Esteio", lat: -29.84, lng: -51.18 };
    expect(await selectCandidate(place)).toEqual(place);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it("confirma um placeId antes de usar coordenadas", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      result: {name:"Loja",address:"Esteio",lat:-29.84,lng:-51.18,source:"google"}
    }) }); vi.stubGlobal("fetch", fetchMock);
    const result = await selectCandidate({name:"Loja",address:"Esteio",lat:0,lng:0,placeId:"ChIJabc",source:"google"},"session1");
    expect(result.lat).toBeCloseTo(-29.84);
    expect(fetchMock).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
