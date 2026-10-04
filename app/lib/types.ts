export type MonthPoint = { month: string; complaints: number };

export type Cluster = {
  cluster_id: number;
  size: number;
  is_focus: boolean;
  defect_keyword_matches: number;
  purity: number;
  top_terms: string[];
};

export type EvidenceRow = {
  months_before_recall: number;
  as_of: string;
  complaints_filed: number;
};

export type SensitivityRow = {
  threshold: number;
  alert_month: string | null;
  lead_months: number | null;
};

export type VehicleMeta = {
  window: string;
  recall_campaign_number: string;
  recall_signal_month: string;
  defect_description: string;
  source: string;
  total_complaints_analyzed?: number;
  n_clusters?: number;
  focus_cluster_ids?: number[];
  focus_cluster_size?: number;
};

export type ValidatedVehicle = {
  vehicle_id: string;
  make: string;
  model: string;
  status: "validated";
  meta: VehicleMeta & {
    total_complaints_analyzed: number;
    n_clusters: number;
    focus_cluster_ids: number[];
    focus_cluster_size: number;
  };
  validation: {
    defect_keyword_matches: number;
    base_rate: number;
    focus_recall: number;
    focus_purity: number;
    focus_lift: number;
    distinct_compdesc_labels: number;
    compdesc_breakdown: Record<string, number>;
    note: string;
  };
  detection: {
    policy: string;
    primary_threshold: number;
    alert_month: string | null;
    lead_months: number | null;
    complaints_on_file_before_recall: number;
    cumulative_evidence: EvidenceRow[];
    alert_sensitivity: SensitivityRow[];
    timeline_field: string;
    timeline_note: string;
  };
  monthly_series: MonthPoint[];
  clusters: Cluster[];
};

export type ExcludedVehicle = {
  vehicle_id: string;
  make: string;
  model: string;
  status: "excluded";
  meta: VehicleMeta;
  excluded_because: string;
};

export type Vehicle = ValidatedVehicle | ExcludedVehicle;

export type ClustersData = {
  generated_at: string;
  method: {
    summary: string;
    preprocessing: string[];
    known_limitations: string[];
  };
  vehicles: Vehicle[];
};

export function isValidated(v: Vehicle): v is ValidatedVehicle {
  return v.status === "validated";
}

/**
 * Chart encoding. Hot is what drivers reported, cold is what the regulator did.
 * Validated against the dark chart surface: magma/steel separate by dE 29 in
 * normal vision and 21 under protanopia.
 */
export const INK = {
  primary: "#efe7f0",
  secondary: "#a99fb0",
  muted: "#6b6472",
  grid: "#221e27",
  surface: "#16141a",
  magma: "#ff5a1f",
  incandescent: "#ffb245",
  steel: "#5f8fbf",
} as const;