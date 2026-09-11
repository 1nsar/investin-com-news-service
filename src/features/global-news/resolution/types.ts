export interface CompanyToResolve {
  id: number;
  ticker: string;
  companyName: string;
  exchangeHint: string | null;
  country: string | null;
  isUsListedRaw: boolean | null;
}

export interface ResolvedListing {
  exchangeCode: string;
  mic: string | null;
  symbol: string;
  symbolFormat: string;
  securityKind: "ordinary" | "adr" | "gdr" | "depositary" | "other";
  country: string | null;
  currency: string | null;
  figi: string | null;
  compositeFigi: string | null;
  shareClassFigi: string | null;
  isin: string | null;
  isPrimary: boolean;
  isUs: boolean;
  confidence: number;
  source: "openfigi" | "finnhub_directory" | "catalogue";
}

export interface CompanyResolution {
  companyId: number;
  ticker: string;
  status: "resolved" | "ambiguous" | "unresolved";
  note: string | null;
  listings: ResolvedListing[];
}

export interface ResolutionSummary {
  attempted: number;
  resolved: number;
  ambiguous: number;
  unresolved: number;
  listingsWritten: number;
  withUsListing: number;
  withAdr: number;
  /** Companies whose resolved identity contradicts the catalogue's hint - the
   *  ticker collisions. Reported because they are the highest-risk rows: left
   *  alone they file one company's news under another. */
  hintCorrections: { ticker: string; catalogueName: string; resolvedName: string; venue: string }[];
}
