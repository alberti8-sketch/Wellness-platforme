export type BandCode = "best" | "middle" | "bad";
export type Severity = "error" | "warning";

export interface Me {
  name: string;
  role: "viewer" | "contributor" | "admin";
  tenant: { id: string; name: string; stakeholder_type: "B2B" | "B2G"; allowed_territories: string[] | null };
}

export interface Dimension {
  code: string;
  label: string;
  description: string;
  default_weight: number;
  is_outcome: boolean;
}

export interface Indicator {
  code: string;
  label: string;
  dimension: string;
  unit: string;
  direction: "higher_is_better" | "lower_is_better";
  ref_min: number;
  ref_max: number;
  hard_min: number;
  hard_max: number;
  weight: number;
  source_hint: string;
}

export interface Catalog {
  dimensions: Dimension[];
  indicators: Indicator[];
  bands: { code: BandCode; label: string; min: number }[];
  context_columns: Record<string, string>;
  territory_types: TerritoryType[];
}

export type TerritoryType = "urbain" | "semi-urbain" | "rural";

export interface TerritoryContext {
  level: "commune" | "departement" | null;
  territory_type: TerritoryType | null;
  population: number | null;
  density_km2: number | null;
  source_global_score: number | null;
}

export interface Issue {
  row: number | null;
  column: string | null;
  severity: Severity;
  code: string;
  message: string;
}

export interface ValidationReport {
  columns: string[];
  indicator_columns: string[];
  unknown_columns: string[];
  missing_indicator_columns: string[];
  raw_rows: Record<string, unknown>[];
  rows: { row: number; territory_code: string; territory_name: string; period: number; values: Record<string, number | null> }[];
  issues: Issue[];
  error_count: number;
  warning_count: number;
}

export interface DatasetSummary {
  id: string;
  status: string;
  source_type: "excel" | "manual";
  filename: string | null;
  stakeholder_type: string;
  submitted_by: string;
  organization: string;
  description: string | null;
  row_count: number;
  reviewed_by: string | null;
  review_comment: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  error_count: number;
  warning_count: number;
}

export interface Cell {
  raw_value: number | null;
  score: number | null;
  band: BandCode | null;
  flags: string[];
}

export interface DimensionScore {
  score: number | null;
  band: BandCode | null;
  coverage: number;
}

export interface DatasetDetail extends DatasetSummary {
  events: { from_state: string | null; to_state: string; actor: string; message: string | null; duration_ms: number | null; at: string }[];
  issues: Issue[];
  table: {
    source_row: number;
    territory_code: string;
    territory_name: string;
    period: number;
    cells: Record<string, Cell>;
    dimensions: Record<string, DimensionScore>;
  }[];
  pipeline_states: string[];
}

export interface Territory {
  code: string;
  name: string;
  period: number;
  context: TerritoryContext;
  dataset_id: string;
  published_at: string | null;
  composite: DimensionScore;
  dimensions: Record<string, DimensionScore>;
  indicators: Record<string, Cell>;
}

export interface Overview {
  periods: number[];
  period: number | null;
  weights: Record<string, number>;
  territories: Territory[];
  band_counts: Record<string, number>;
  average: number | null;
}
