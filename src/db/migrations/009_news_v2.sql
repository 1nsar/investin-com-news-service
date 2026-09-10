-- Additive V2 storage: V1 identities, tables and article histories remain intact.
CREATE TABLE IF NOT EXISTS news_v2_provider_configs (
  provider_id TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  credentials_encrypted TEXT,
  full_text_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  display_licensed BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS news_v2_provider_state (
  provider_id TEXT PRIMARY KEY,
  checkpoint TEXT,
  last_success_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  next_request_at TIMESTAMPTZ,
  budget_day DATE,
  requests_today INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS news_v2_articles (
  id UUID PRIMARY KEY,
  provider_id TEXT NOT NULL,
  provider_article_id TEXT NOT NULL,
  headline TEXT NOT NULL,
  summary TEXT,
  body TEXT,
  publisher TEXT NOT NULL,
  publisher_url TEXT,
  url TEXT NOT NULL,
  image_url TEXT,
  published_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  language TEXT,
  topics TEXT[] NOT NULL DEFAULT '{}',
  genre TEXT,
  rights JSONB NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  content_hash TEXT NOT NULL,
  correction BOOLEAN NOT NULL DEFAULT FALSE,
  deleted BOOLEAN NOT NULL DEFAULT FALSE,
  entity_evidence JSONB NOT NULL DEFAULT '[]',
  UNIQUE (provider_id, provider_article_id)
);
CREATE INDEX IF NOT EXISTS news_v2_articles_date_idx ON news_v2_articles(published_at DESC,id DESC) WHERE NOT deleted;
CREATE INDEX IF NOT EXISTS news_v2_articles_provider_date_idx ON news_v2_articles(provider_id,published_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS news_v2_articles_topics_idx ON news_v2_articles USING gin(topics);
CREATE TABLE IF NOT EXISTS news_v2_article_companies (
  article_id UUID NOT NULL REFERENCES news_v2_articles(id) ON DELETE CASCADE,
  company_id BIGINT NOT NULL REFERENCES companies(id),
  evidence JSONB NOT NULL,
  PRIMARY KEY(article_id,company_id)
);
CREATE INDEX IF NOT EXISTS news_v2_article_companies_company_idx ON news_v2_article_companies(company_id,article_id);
CREATE TABLE IF NOT EXISTS news_v2_article_revisions (
  article_id UUID NOT NULL REFERENCES news_v2_articles(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  action TEXT NOT NULL CHECK(action IN ('upsert','delete')),
  snapshot JSONB NOT NULL,
  PRIMARY KEY(article_id,revision)
);
CREATE TABLE IF NOT EXISTS news_v2_jobs (
  id UUID PRIMARY KEY,
  provider_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','succeeded','partial','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  lease_owner UUID,
  lease_until TIMESTAMPTZ,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checkpoint TEXT,
  pages INTEGER NOT NULL DEFAULT 0,
  articles_seen INTEGER NOT NULL DEFAULT 0,
  articles_stored INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS news_v2_jobs_active_provider_idx ON news_v2_jobs(provider_id) WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS news_v2_jobs_claim_idx ON news_v2_jobs(status,available_at,created_at);
