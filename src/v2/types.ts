/** Shared, secret-free V2 read/API contracts. IDs are strings at the boundary. */
export type ProviderId = "fed" | "ecb" | "sec" | "benzinga" | "marketaux" | "finnhub";
export type SourceFilter = "free" | "all" | "archive" | ProviderId;
export type NewsScope = "all" | "portfolio" | "company" | "macro";
export type ContentMode = "full_text" | "summary" | "link_only";
export type SourceKind = "official" | "wire" | "aggregator" | "archive";

export interface ArticleRights {
  bodyAllowed: boolean;
  imageAllowed: boolean;
  attribution: string;
  licenseStatus: "public_source" | "licensed" | "summary_only" | "unknown";
}
export interface CompanyRef { id: string; name: string; ticker: string | null }
export interface NewsArticle {
  id: string;
  headline: string;
  summary: string | null;
  body: string | null;
  bodyFormat: "text" | null;
  contentMode: ContentMode;
  source: { id: string; name: string; url: string | null; kind: SourceKind };
  url: string;
  imageUrl: string | null;
  publishedAt: string;
  updatedAt: string | null;
  receivedAt: string;
  language: string | null;
  topics: string[];
  genre: string | null;
  companies: CompanyRef[];
  rights: ArticleRights;
  revision: number;
  correction: boolean;
  deleted: boolean;
}
export interface CoverageSummary {
  activeCompanies: number;
  companiesWithV2News: number;
  lastReceivedAt: string | null;
  oldestProviderSuccessAt: string | null;
  note: string;
}
export interface NewsPage {
  data: NewsArticle[];
  pagination: { nextCursor: string | null; hasMore: boolean };
  meta: { scope: NewsScope; source: SourceFilter; generatedAt: string; coverage: CoverageSummary };
}
export interface CompanyDirectoryEntry extends CompanyRef {
  country: string | null;
  resolutionStatus: string;
  listings: { symbol: string; exchange: string; mic: string | null; country: string | null; isPrimary: boolean }[];
}
export interface CompanyPage { data: CompanyDirectoryEntry[]; pagination: { nextCursor: string | null; hasMore: boolean } }
export interface CompanyHint { ticker?: string; exchange?: string; country?: string; name?: string; externalId?: string }
export interface CompanyResolution { input: CompanyHint; status: "matched" | "ambiguous" | "unmatched"; company: CompanyDirectoryEntry | null; candidates: CompanyRef[];
  evidence?: { method: "audited_alias"; sourceUrl: string; checkedAt: string; validUntil: string; note: string } }
export interface ResolveCompaniesRequest { companies: CompanyHint[] }
export interface ResolveCompaniesResponse { data: CompanyResolution[] }

export interface ProviderDefinition {
  id: ProviderId;
  name: string;
  kind: SourceKind;
  free: boolean;
  description: string;
  documentationUrl: string;
  credentialFields: { key: string; label: string; secret: boolean; required: boolean }[];
  supportsFullText: boolean;
  requestsPerMinute: number;
}
export interface ProviderStatus extends ProviderDefinition {
  enabled: boolean;
  configured: boolean;
  credentialFieldsSet: string[];
  fullTextEnabled: boolean;
  displayLicensed: boolean;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  articleCount: number;
  budget: { requestsToday: number; dailyLimit: number; exhausted: boolean; nextRequestAt: string | null };
}
export interface ProvidersResponse { data: ProviderStatus[]; adminConfigured: boolean; encryptionConfigured: boolean }
export type JobStatus = "queued" | "running" | "succeeded" | "partial" | "failed";
export interface SyncJob {
  id: string; providerId: ProviderId; status: JobStatus;
  createdAt: string; startedAt: string | null; finishedAt: string | null;
  pages: number; articlesSeen: number; articlesStored: number; error: string | null;
}
export interface V2Status {
  version: "2";
  workerEnabled: boolean;
  adminConfigured: boolean;
  encryptionConfigured: boolean;
  coverage: CoverageSummary;
  providers: ProviderStatus[];
  jobs: SyncJob[];
  limitations: string[];
}
export interface SyncRequest { providerIds?: ProviderId[] }
export interface SyncResponse { data: SyncJob[]; workerEnabled: boolean }
export interface UpdateProviderRequest { enabled?: boolean; credentials?: Record<string, string>; fullTextEnabled?: boolean; displayLicensed?: boolean }

/** Internal adapter contracts. Credentials never enter public DTOs or logs. */
export interface ProviderCredentials { [key: string]: string }
export interface ProviderArticle {
  sourceId: string;
  action: "upsert" | "delete";
  headline: string;
  summary?: string | null;
  body?: string | null;
  url: string;
  publisher: string;
  publisherUrl?: string | null;
  publishedAt: string;
  updatedAt?: string | null;
  receivedAt?: string;
  imageUrl?: string | null;
  language?: string | null;
  topics?: string[];
  genre?: string | null;
  companies?: CompanyHint[];
  rights: ArticleRights;
  correction?: boolean;
}
export interface ProviderBatch {
  items: ProviderArticle[];
  /** True only when the requested bounded window is exhausted. */
  complete: boolean;
  /** Resume cursor when incomplete; new stable watermark only when complete. */
  nextCheckpoint: string | null;
  notices?: string[];
}
export interface ProviderFetchRequest {
  providerId: ProviderId;
  credentials: ProviderCredentials;
  checkpoint: string | null;
  signal: AbortSignal;
  limit: number;
  fullTextEnabled: boolean;
  acquireRequest?: () => Promise<void>;
}
