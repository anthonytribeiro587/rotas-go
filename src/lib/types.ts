export type Point = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
};

export type VisitStatus = "pending" | "visited" | "skipped";
export type Visit = Point & { status: VisitStatus };

export type Optimization = {
  order: number[];
  geometry: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
  exact: boolean;
};

export type SavedPlan = {
  id: string;
  createdAt: string;
  start: Point;
  end: Point;
  stops: Visit[];
  optimization: Optimization | null;
  manual?: boolean;
};

export type SearchResult = Omit<Point, "id"> & { city?: string; state?: string; distanceKm?: number; provider?: "geoapify" | "photon" };
