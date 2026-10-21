import { describe, expect, it } from "vitest";
import { mapGeoapifyResults } from "../src/lib/geoapify-search";
describe("Geoapify geocoding adapter", () => {
  it("tags city suggestions so the UI uses them as the search region", () => {
    const result=mapGeoapifyResults({results:[{city:"Pomerode",lat:-26.739,lon:-49.176,result_type:"city",country_code:"br"}]},"Pomerode",null,false);
    expect(result[0].kind).toBe("city");
  });
  it("maps a Brazilian city with location", () => {
    const items = mapGeoapifyResults({results:[{name:"Pomerode",city:"Pomerode",state:"Santa Catarina",country_code:"br",result_type:"city",lat:-26.739,lon:-49.176}]},"Pomerode",null,true);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Pomerode");
    expect(items[0].lng).toBeCloseTo(-49.176);
  });
  it("does not invent a location for invalid or foreign results", () => {
    const rows=mapGeoapifyResults({results:[
      {name:"Origin",lat:0,lon:0,country_code:"br"},
      {name:"Foreign",lat:42,lon:-73,country_code:"us"},
      {name:"Brazil",lat:-29.8,lon:-51.2,country_code:"br"}
    ]},"Brazil",null,false);
    expect(rows.map(x=>x.name)).toEqual(["Brazil"]);
  });
  it("does not confuse Esteio RS with unrelated cities called Esteios", () => {
    const matches = mapGeoapifyResults({results: [
      {name:"Esteio", city:"Esteio", state:"Rio Grande do Sul", result_type:"city",country_code:"br",lat:-29.85,lon:-51.18},
      {name:"Esteios", city:"São Gabriel da Cachoeira",state:"Amazonas",result_type:"city",country_code:"br",lat:-0.13,lon:-67.09},
      {name:"Esteios",city:"Luz",state:"Minas Gerais",result_type:"city",country_code:"br",lat:-19.81,lon:-45.68}
    ]}, "Esteio", null, true);
    expect(matches.map(x => x.name)).toEqual(["Esteio"]);
  });
  it("still allows partial city names while typing", () => {
    const matches=mapGeoapifyResults({results:[
      {city:"Pomerode",state:"Santa Catarina",result_type:"city",country_code:"br",lat:-26.74,lon:-49.17}
    ]}, "Pome", null, true);
    expect(matches).toHaveLength(1);
  });
  it("keeps only municipalities for the city search mode", () => {
    const rows=mapGeoapifyResults({results:[
      {name:"Store",lat:-26.73,lon:-49.17,country_code:"br",result_type:"amenity"},
      {city:"Pomerode",lat:-26.74,lon:-49.18,country_code:"br",result_type:"city"}
    ]},"Pomerode",null,true);
    expect(rows.map(x=>x.name)).toEqual(["Pomerode"]);
  });
});
