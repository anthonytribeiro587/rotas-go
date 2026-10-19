/**
 * Transform user-supplied .csv and .xlsx rows into destinations.
 * This module never guesses geographic coordinates: only explicit coordinates
 * and individually verified geocoder candidates are ready for a route.
 */
export type RawCell = string | number | boolean | Date | null | undefined;
export type ImportDestination = {
  id: string;
  line: number;
  name: string;
  street: string;
  number: string;
  district: string;
  city: string;
  state: string;
  zip: string;
  notes: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  error: string | null;
};

const aliases: Record<string, string[]> = {
  name: ["nome do local", "nome", "local", "destino", "destinatario", "cliente", "comercio", "estabelecimento", "empresa", "razao social", "nome fantasia", "ponto de visita"],
  street: ["endereco", "endereco completo", "logradouro", "rua", "avenida", "av", "address", "localizacao"],
  number: ["numero", "n", "num", "numero predial", "numero endereco"],
  district: ["bairro", "distrito", "suburb"],
  city: ["cidade", "municipio", "city"],
  state: ["uf", "estado", "sigla uf", "state"],
  zip: ["cep", "codigo postal", "zip", "zipcode"],
  latitude: ["latitude", "lat"],
  longitude: ["longitude", "long", "lng", "lon"],
  notes: ["observacoes", "observacao", "obs", "complemento", "referencia", "notas"]
};

export function normalizeHeader(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function cellString(value: RawCell) {
  return value === null || value === undefined ? "" : String(value).trim();
}
function columnKey(value: RawCell) {
  const key = normalizeHeader(cellString(value));
  for (const [field, names] of Object.entries(aliases)) {
    if (names.includes(key)) return field;
  }
  return "";
}
function parseCoordinate(value: string, min: number, max: number): number | null {
  if (!value) return null;
  const num = Number(value.trim().replace(",", "."));
  return Number.isFinite(num) && num >= min && num <= max ? num : NaN;
}

export function destinationsFromRows(matrix: RawCell[][], limit = 500): ImportDestination[] {
  const rowIndex = matrix.findIndex((row, index) => {
    if (index > 9) return false;
    const fields = row.map(columnKey).filter(Boolean);
    return fields.some(f => f === "name" || f === "street") &&
      fields.some(f => ["city", "state", "latitude", "longitude", "street", "number"].includes(f));
  });
  if (rowIndex < 0) throw new Error("Não encontrei os títulos das colunas. Use a aba Destinos do modelo ou uma planilha com Nome, Endereço e Cidade.");
  const columnMap: Record<string, number> = {};
  matrix[rowIndex].forEach((cell, index) => {
    const key = columnKey(cell);
    if (key && columnMap[key] === undefined) columnMap[key] = index;
  });
  const destinationRows = matrix.slice(rowIndex + 1).filter(row => row.some(cell => cellString(cell)));
  if (destinationRows.length > limit) throw new Error("A planilha tem muitos destinos. Envie no máximo " + limit + " linhas por arquivo.");
  return destinationRows.map((row, index) => {
    const field = (key: string) => columnMap[key] === undefined ? "" : cellString(row[columnMap[key]]);
    const street = field("street"), number = field("number"), district = field("district");
    const city = field("city"), state = field("state"), zip = field("zip");
    const label = field("name") || [street, number].filter(Boolean).join(", ");
    const address = [[street, number].filter(Boolean).join(", "), district, city, state, zip].filter(Boolean).join(" · ");
    const lat = parseCoordinate(field("latitude"), -90, 90);
    const lng = parseCoordinate(field("longitude"), -180, 180);
    let error: string | null = null;
    if (!label) error = "Informe o nome do local ou endereço.";
    else if (Number.isNaN(lat) || Number.isNaN(lng)) error = "Coordenadas inválidas. Confira latitude e longitude.";
    else if ((lat === null) !== (lng === null)) error = "Preencha latitude e longitude juntas.";
    else if ((lat === null || lng === null) && !street && !city) error = "Informe endereço e cidade, ou as duas coordenadas.";
    return {
      id: "import-" + (rowIndex + index + 2) + "-" + index,
      line: rowIndex + index + 2,
      name: label,
      street, number, district, city, state, zip,
      notes: field("notes"),
      address: address || label,
      latitude: lat, longitude: lng,
      error
    };
  });
}

/** RFC4180 CSV with comma/semicolon/tab, quoted fields, BOM and escaped double quotes. */
export function parseDelimited(text: string): RawCell[][] {
  const input = text.replace(/^\uFEFF/, "");
  const firstLine = input.split(/\r?\n/, 1)[0] || "";
  const delimiters = [";", ",", "\t"];
  const occurrences = (delimiter: string) => {
    let count = 0, quoted = false;
    for (let i = 0; i < firstLine.length; i++) {
      if (firstLine[i] === '"' && firstLine[i + 1] === '"') { i++; continue; }
      if (firstLine[i] === '"') quoted = !quoted;
      else if (!quoted && firstLine[i] === delimiter) count++;
    }
    return count;
  };
  const delimiter = delimiters.sort((a, b) => occurrences(b) - occurrences(a))[0];
  const rows: RawCell[][] = [];
  let line: string[] = [], value = "", quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (quoted && input[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (c === delimiter && !quoted) {
      line.push(value); value = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && input[i + 1] === "\n") i++;
      line.push(value);
      if (line.some(x => x.trim())) rows.push(line);
      line = []; value = "";
    } else {
      value += c;
    }
  }
  line.push(value);
  if (line.some(x => x.trim())) rows.push(line);
  return rows;
}
