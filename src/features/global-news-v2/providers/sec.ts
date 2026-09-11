import type { CompanyHint, ProviderArticle, ProviderBatch, ProviderFetchRequest } from "../types.js";
import { allowedUrl, batchLimit, checkpoint, iso, ProviderFetchError, readCheckpoint, record, sourceJson, sourceText, string } from "./http.js";
import { array, OFFICIAL_POLICIES, parseXml, xmlText } from "./official.js";
import { officialBody, plainText } from "./text.js";

interface Filing { cik: string; accession: string; form: string; title: string; publishedAt: string; url: string; document?: string; companies?: CompanyHint[] }
const FORMS = new Set(["8-K", "8-K/A", "6-K", "6-K/A", "10-Q", "10-Q/A", "10-K", "10-K/A", "20-F", "40-F"]);
const cikValue = (raw: string): string | null => /^\d{1,10}$/.test(raw) && Number(raw) > 0 ? raw.padStart(10, "0") : null;

function companyHints(data: Record<string, unknown>, cik: string): CompanyHint[] {
  const tickers = array(data.tickers), exchanges = array(data.exchanges);
  return tickers.length ? tickers.map((ticker, index) => ({ ticker: string(ticker), exchange: string(exchanges[index]) || undefined,
    name: string(data.name) || undefined, externalId: `cik:${cik}` }))
    : [{ externalId: `cik:${cik}`, name: string(data.name) || undefined }];
}

function submissions(data: Record<string, unknown>, cik: string): Filing[] {
  const recent = record(record(data.filings).recent), accessions = array(recent.accessionNumber);
  if (!data.filings || !recent.accessionNumber) throw new ProviderFetchError("invalid_response", "SEC submissions response lacks recent filings");
  const forms = array(recent.form), dates = array(recent.acceptanceDateTime), docs = array(recent.primaryDocument);
  const hints = companyHints(data, cik);
  return accessions.flatMap((value, index): Filing[] => {
    const accession = string(value), form = string(forms[index]), publishedAt = iso(dates[index]), document = string(docs[index]);
    if (!FORMS.has(form)) return [];
    if (!/^\d{10}-\d{2}-\d{6}$/.test(accession) || !publishedAt || !/^[a-z0-9_.-]+\.(?:htm|html|txt)$/i.test(document)) {
      throw new ProviderFetchError("invalid_response", "SEC filing lacks a validated accession, document or acceptance time");
    }
    const url = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replaceAll("-", "")}/${document}`;
    allowedUrl("sec", url, "body");
    return [{ cik, accession, form, title: `${string(data.name) || "SEC filer"} — ${form} filing`, publishedAt, url, document, companies: hints }];
  });
}

function atomFilings(raw: string): Filing[] {
  const parsed = parseXml(raw), feed = record(parsed.feed);
  if (!parsed.feed) throw new ProviderFetchError("invalid_response", "SEC did not return an Atom feed");
  const entries = array(feed.entry);
  if (entries.length > 100) throw new ProviderFetchError("invalid_response", "SEC feed exceeds the 100-entry snapshot limit");
  return entries.flatMap((entry): Filing[] => {
    const row = record(entry), title = plainText(xmlText(row.title));
    const form = string(record(array(row.category)[0])["@_term"]) || title.split(" - ")[0] || "";
    if (!FORMS.has(form)) return [];
    const link = array(row.link).map(record).find((item) => item["@_rel"] === "alternate") ?? record(array(row.link)[0]);
    const rawUrl = string(link["@_href"]), publishedAt = iso(xmlText(row.updated));
    const match = rawUrl.match(/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/(\d{1,10})\/(\d{18})\/([a-z0-9_.-]+)\.(?:htm|html)$/i);
    if (!match || !publishedAt) throw new ProviderFetchError("invalid_response", "SEC feed entry lacks validated filing identity or time");
    const cik = cikValue(match[1]!)!, digits = match[2]!;
    return [{ cik, accession: `${digits.slice(0, 10)}-${digits.slice(10, 12)}-${digits.slice(12)}`, form, title,
      publishedAt, url: allowedUrl("sec", rawUrl, "body").toString() }];
  });
}

export async function fetchSec(request: ProviderFetchRequest): Promise<ProviderBatch> {
  const state = readCheckpoint(request.checkpoint, "sec"), notices: string[] = [];
  const configured = (request.credentials.ciks ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  if (configured.length > 10 || configured.some((value) => !cikValue(value))) throw new ProviderFetchError("invalid_response", "SEC targeted mode requires at most ten numeric CIKs");
  const ciks = [...new Set(configured.map((value) => cikValue(value)!))], scope = ciks.join(",") || "latest-filings";
  if (state.scope && state.scope !== scope) throw new ProviderFetchError("invalid_response", "SEC scope changed; reset its checkpoint");
  let cikIndex = Number(state.cikIndex) || 0;
  if (!Number.isInteger(cikIndex) || cikIndex < 0 || cikIndex > ciks.length) throw new ProviderFetchError("invalid_response", "Invalid SEC CIK cursor");
  const fetched = new Map<string, Filing[]>();
  let pending: Filing[];
  if (state.kind === "sec_pending" && Array.isArray(state.pending)) {
    if (state.pending.length > 100) throw new ProviderFetchError("invalid_response", "SEC cursor exceeds its bound");
    pending = state.pending as Filing[];
    for (const filing of pending) {
      if (!cikValue(filing.cik) || !/^\d{10}-\d{2}-\d{6}$/.test(filing.accession) || !iso(filing.publishedAt)) throw new ProviderFetchError("invalid_response", "Invalid SEC filing cursor");
      allowedUrl("sec", filing.url, "body");
    }
  } else if (ciks.length) {
    const cik = ciks[cikIndex] ?? ciks[0]!;
    const data = record(await sourceJson("sec", `https://data.sec.gov/submissions/CIK${cik}.json`, request.signal));
    const filings = submissions(data, cik); fetched.set(cik, filings);
    // A deliberate preview scope: ten latest relevant disclosures per selected CIK.
    pending = filings.slice(0, 10);
    if (filings.length > 10) notices.push("Targeted SEC preview selects the latest ten supported disclosures per CIK; older filings are outside this scope.");
  } else {
    const url = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&count=100&output=atom";
    pending = atomFilings(await sourceText("sec", url, request.signal));
  }
  const selected = pending.slice(0, Math.min(batchLimit(request.limit), 5)), items: ProviderArticle[] = [];
  for (const entry of selected) {
    let filing = entry, body: string | null = null;
    try {
      if (!entry.document) {
        let filings = fetched.get(entry.cik);
        if (!filings) {
          filings = submissions(record(await sourceJson("sec", `https://data.sec.gov/submissions/CIK${entry.cik}.json`, request.signal)), entry.cik);
          fetched.set(entry.cik, filings);
        }
        const matched = filings.find((candidate) => candidate.accession === entry.accession);
        if (!matched) throw new ProviderFetchError("invalid_response", "SEC primary document could not be matched to the accession");
        filing = matched;
      }
      body = officialBody("sec", await sourceText("sec", filing.url, request.signal, { purpose: "body" }));
    } catch (error) {
      if (!(error instanceof ProviderFetchError) || error.code === "aborted" || error.code === "rate_limited" || error.code === "auth") throw error;
      // Failed retrieval is not a source revision. In particular, emitting a
      // null body would overwrite a previously imported readable disclosure.
      // The next bounded SEC snapshot can retry transient failures normally.
      notices.push(`SEC document unavailable (${error.code}); no article update emitted, preserving any previously imported text. No access block bypassed.`);
      continue;
    }
    items.push({ sourceId: `${filing.cik}:${filing.accession}`, action: "upsert", headline: filing.title, url: filing.url,
      summary: `Issuer disclosure filed as ${filing.form}; accession ${filing.accession}.`, body,
      publisher: "SEC EDGAR", publisherUrl: OFFICIAL_POLICIES.sec.origin, publishedAt: filing.publishedAt,
      updatedAt: null, receivedAt: new Date().toISOString(), language: "en", genre: "issuer-disclosure",
      topics: /^10-[KQ]|20-F|40-F/.test(filing.form) ? ["earnings"] : ["regulation"],
      companies: filing.companies ?? [{ externalId: `cik:${filing.cik}` }], imageUrl: null,
      correction: filing.form.endsWith("/A"), rights: { bodyAllowed: body !== null, imageAllowed: false,
        attribution: `${OFFICIAL_POLICIES.sec.attribution} ${OFFICIAL_POLICIES.sec.policy}`, licenseStatus: "public_source" } });
  }
  const remaining = pending.slice(selected.length);
  if (!remaining.length) cikIndex++;
  const complete = !remaining.length && (!ciks.length || cikIndex >= ciks.length);
  return { items, complete, nextCheckpoint: complete ? checkpoint("sec", { kind: "sec_complete", scope, checkedAt: new Date().toISOString() })
    : checkpoint("sec", { kind: remaining.length ? "sec_pending" : "sec_next", scope, cikIndex, pending: remaining }),
    notices: [...notices, "SEC public endpoints returned HTTP403 in local live checks on 9 September 2026. Access success is not assumed; at most two SEC requests/second and no access-block retries."] };
}
