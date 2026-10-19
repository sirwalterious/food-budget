export type PlanId = 'thrifty' | 'low' | 'moderate' | 'liberal';
export type Sex = 'F' | 'M';
export type View = 'weekly' | 'monthly';
export type RegionId = 'us' | 'ak-anchorage' | 'ak-urban' | 'ak-rural1' | 'ak-rural2' | 'hi';

export interface Group {
  id: string;
  label: string;
  sex: Sex | null; // null = child group (no sex distinction)
  ageMin: number;
  ageMax: number;
  weekly: number;
  monthly: number;
}

export interface PlanData {
  name: string;
  groups: Group[];
}

export interface PdfInfo {
  url: string;
  sha256: string;
}

export interface CostData {
  meta: {
    month: string; // YYYY-MM
    monthLabel: string; // "August 2026"
    issuedLabel: string; // "September 2026"
    sourceUrl: string;
    fetchedAt: string;
    pdfs: { thrifty: PdfInfo; lowmodlib: PdfInfo; akhi: PdfInfo };
  };
  householdAdjustment: { minSize: number; maxSize: number; percent: number }[];
  referenceFamily: { weekly: number; monthly: number }; // Thrifty, US average
  plans: Record<PlanId, PlanData>;
  regions: {
    anchorageMonthly: number; // Thrifty reference family, Anchorage
    hawaiiMonthly: number; // Thrifty reference family, Hawaii
    alaskaPercentAboveAnchorage: { urban: number; ruralI: number; ruralII: number };
  };
}

export interface Person {
  sex: Sex;
  age: number;
}
