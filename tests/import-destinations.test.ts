import { describe, expect, it } from "vitest";
import { destinationsFromRows, normalizeHeader, parseDelimited } from "../src/lib/import-destinations";

describe("importação de destinos", () => {
  it("remove acentos e mapeia nomes de colunas", () => {
    expect(normalizeHeader("Endereço Completo")).toBe("endereco completo");
    const list = destinationsFromRows([
      ["Cliente","Endereço Completo","Número","Município","UF","CEP"],
      ["Loja A","Rua Dom Pedro",128,"Esteio","RS","09300000"]
    ]);
    expect(list[0].name).toBe("Loja A");
    expect(list[0].number).toBe("128");
    expect(list[0].city).toBe("Esteio");
    expect(list[0].error).toBeNull();
  });
  it("aceita CSV separado por ponto e vírgula, com campos entre aspas", () => {
    const rows = parseDelimited('\uFEFFNome do local;Endereço;Cidade;UF\r\n"Loja; filial";"Rua das Flores, 100";Canoas;RS');
    const list = destinationsFromRows(rows);
    expect(list[0].name).toBe("Loja; filial");
    expect(list[0].street).toBe("Rua das Flores, 100");
  });
  it("não inventa coordenadas nem aceita par incompleto", () => {
    const records = destinationsFromRows([
      ["Nome","Cidade","Latitude","Longitude"],
      ["A","Sapucaia do Sul","-29,82","-51,16"],
      ["B","Esteio",-29.82,""]
    ]);
    expect(records[0].latitude).toBeCloseTo(-29.82);
    expect(records[0].error).toBeNull();
    expect(records[1].error).toContain("juntas");
  });
  it("ignora linhas vazias e limita o tamanho", () => {
    const rows = [["Nome do local","Endereço","Cidade"],["A","Rua X","Esteio"],["","",""]];
    expect(destinationsFromRows(rows)).toHaveLength(1);
    expect(() => destinationsFromRows(rows, 0)).toThrow("muitos");
  });
});
