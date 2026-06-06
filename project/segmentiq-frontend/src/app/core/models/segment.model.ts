// src/app/core/models/segment.model.ts

export type NavPage =
  | 'dashboard' | 'segments' | 'customers' | 'report'
  | 'behavior' | 'params' | 'campaigns'
  | 'spending-value' | 'frequency' | 'category-affinity' | 'seasonality' | 'price-discount' | 'returns' | 'normalization';

export interface SegmentMeta {
  id: number;
  name: string;
  icon: string;
  color: string;
  colorBg: string;
  description: string;
}

export interface SegmentAgg {
  n: number;
  avg_spend: number;
  avg_orders: number;
  avg_recency: number;
  avg_return_rate: number;
  avg_refund_ratio: number;
  avg_aov: number;
  avg_active_months: number;
  avg_discount: number;
  avg_ipt: number;
  avg_diversity: number;
  avg_sp30: number;
  avg_sp90: number;
  avg_sp365: number;
  avg_ord30: number;
  avg_ord90: number;
  avg_ord365: number;
  avg_spend_velocity: number;
  avg_clv_slope: number;
  avg_lifespan: number;
  avg_spend_momentum: number;
  avg_net_revenue: number;
  avg_projected_annual: number;
  clv_growing_pct: number;
  clv_declining_pct: number;
  monthly: Record<string, number>;
  monthly_active_pct: Record<string, number>;
  cats: Record<string, number>;
}

export interface SamplePoint {
  customer_id: string;
  seg: number;
  segment: string;
  pca_x: number;
  pca_y: number;
  total_spend: number;
  order_count: number;
  recency: number;
  aov: number;
  avg_discount: number;
  top_cat: string;
  top_channel: string;
  gender: string;
  region: string;
  acquisition_channel: string;
  active_months: number;
  return_rate: number;
  refund_ratio: number;
  diversity: number;
  unique_cats: number;
  unique_prods: number;
  spend_30: number;
  spend_90: number;
  spend_365: number;
  orders_30: number;
  orders_90: number;
  orders_365: number;
}

export interface QuarterlyTopProduct {
  product_id: string;
  name: string;
  revenue: number;
  share: number;
}

export interface QuarterlyTopCategory {
  name: string;
  revenue: number;
  share: number;
}

export interface SummaryData {
  total_customers: number;
  total_orders: number;
  /** Orders excluding returned order_ids — use this for display */
  total_fulfilled_orders: number;
  /** Gross revenue = toutes commandes y compris retournées */
  gross_revenue: number;
  /** Total Revenue = paiements confirmés PaymentLog dédupliqué sur InvoiceId = 2,894,094 KD */
  total_revenue: number;
  total_returns: number;
  total_refund_amount: number;
  /** Legacy — revenue / total_orders (biased). Kept for backward compat. */
  avg_order_value: number;
  /** Corrected AOV — revenue / fulfilled orders only */
  true_aov: number;
  return_rate: number;
  clv_growing_pct?: number;
  retention_rate: number;
  active_customers_90: number;
  monthly_revenue: Record<string, number>;
  monthly_aov: Record<string, number>;
  revenue_by_segment: Record<string, number>;
  /** Exact revenue per category, computed directly from orders table */
  category_revenue: Record<string, number>;
  /** YoY growth % pre-computed server-side (null if insufficient history) */
  yoy_pct: number | null;
  yoy_last12: number;
  yoy_prev12: number;
  channel_counts: Record<string, number>;
  region_dist: Record<string, number>;
  gender_dist: Record<string, number>;
  acq_dist: Record<string, number>;
  return_reasons: Record<string, number>;
  return_statuses: Record<string, number>;
  price_bands: { high: number; mid: number; low: number };
  ref_date: string;
  /** Top 3 produits vendus réellement par trimestre (Q1–Q4), triés par revenue desc */
  quarterly_top_products?: Record<string, QuarterlyTopProduct[]>;
  /** Top 3 catégories par revenue réel par trimestre (Q1–Q4) */
  quarterly_top_categories?: Record<string, QuarterlyTopCategory[]>;
}

export interface PcaLoading {
  feature: string;
  pc1: number;
  pc2: number;
}

export interface PcaMeta {
  /** Variance ratio for [PC1, PC2], e.g. [0.42, 0.21] */
  explained_variance: [number, number];
  /** Sum of both ratios */
  total_explained: number;
  /** Per-feature loadings, sorted by |pc1| desc */
  loadings: PcaLoading[];
  /** Number of active features used */
  n_features: number;
}