-- V2-only, reviewed security-to-issuer mappings. V1 catalogue/listings stay intact.
-- Evidence checked 2026-09-09. Re-review before the one-year expiry or on any
-- corporate-action/issuer conflict; do not broaden this into ticker guessing.
CREATE TABLE IF NOT EXISTS news_v2_company_aliases (
  alias_name_normalized TEXT NOT NULL,
  ticker TEXT NOT NULL,
  mic TEXT NOT NULL CHECK (mic ~ '^[A-Z0-9]{4}$'),
  issuer_country TEXT NOT NULL CHECK (issuer_country ~ '^[A-Z]{2}$'),
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  issuer_name_normalized TEXT NOT NULL,
  requires_catalogue_listing BOOLEAN NOT NULL DEFAULT TRUE,
  source_url TEXT NOT NULL CHECK (source_url LIKE 'https://%'),
  checked_at DATE NOT NULL,
  valid_until DATE NOT NULL CHECK (valid_until > checked_at),
  evidence_note TEXT NOT NULL,
  external_identifiers JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (alias_name_normalized,ticker,mic,issuer_country)
);

-- ASML's own listings table identifies NASDAQ ASML, registered ordinary shares,
-- ISIN USN070592100 and CUSIP N07059210. Existing company data lacks that venue.
-- Seed only one exact issuer, and refuse a conflicting issuer on the same venue.
INSERT INTO news_v2_company_aliases(alias_name_normalized,ticker,mic,issuer_country,company_id,issuer_name_normalized,requires_catalogue_listing,source_url,checked_at,valid_until,evidence_note,external_identifiers)
SELECT 'asml holding nv','ASML','XNAS','NL',c.id,'asml holding nv',FALSE,
  'https://www.asml.com/en/investors/shares',DATE '2026-09-09',DATE '2027-09-09',
  'Issuer share-listings table confirms NASDAQ ticker ASML. This V2 override supplies a venue missing from the legacy catalogue; issuer country remains Netherlands.',
  '{"isin":"USN070592100","cusip":"N07059210","security":"registered NASDAQ ordinary shares"}'::jsonb
FROM companies c WHERE c.is_active AND c.ticker_raw='ASML' AND c.company_name='ASML Holding NV' AND c.country_raw='NL'
AND (SELECT count(*) FROM companies x WHERE x.is_active AND x.ticker_raw='ASML' AND x.company_name='ASML Holding NV' AND x.country_raw='NL')=1
AND NOT EXISTS(SELECT 1 FROM listings l JOIN companies other ON other.id=l.company_id
  WHERE other.is_active AND upper(l.symbol)='ASML' AND upper(l.mic)='XNAS' AND lower(other.company_name)<>lower(c.company_name))
ON CONFLICT DO NOTHING;

-- Alphabet's Q2 2026 filing cover explicitly associates Class A with GOOGL and
-- Class C with GOOG. This alias preserves that distinction and requires the
-- already-resolved GOOGL/XNAS listing on the US catalogue issuer.
INSERT INTO news_v2_company_aliases(alias_name_normalized,ticker,mic,issuer_country,company_id,issuer_name_normalized,requires_catalogue_listing,source_url,checked_at,valid_until,evidence_note,external_identifiers)
SELECT 'alphabet inc class a','GOOGL','XNAS','US',c.id,'alphabet',TRUE,
  'https://www.sec.gov/Archives/edgar/data/1652044/000165204426000071/R1.htm',DATE '2026-09-09',DATE '2027-09-09',
  'Alphabet issuer filing for quarter ended 2026-06-30 identifies GOOGL as Class A Common Stock on NASDAQ. Class C GOOG is a different security and is not covered by this alias.',
  '{"cik":"0001652044","security":"Class A Common Stock","filing_period":"2026-06-30"}'::jsonb
FROM companies c WHERE c.is_active AND c.ticker_raw='GOOGL' AND c.company_name='Alphabet Inc' AND c.country_raw='US'
AND (SELECT count(*) FROM companies x WHERE x.is_active AND x.ticker_raw='GOOGL' AND x.company_name='Alphabet Inc' AND x.country_raw='US')=1
AND EXISTS(SELECT 1 FROM listings l WHERE l.company_id=c.id AND upper(l.symbol)='GOOGL' AND upper(l.mic)='XNAS')
AND NOT EXISTS(SELECT 1 FROM listings l JOIN companies other ON other.id=l.company_id
  WHERE other.is_active AND upper(l.symbol)='GOOGL' AND upper(l.mic)='XNAS' AND lower(other.company_name)<>lower(c.company_name))
ON CONFLICT DO NOTHING;
