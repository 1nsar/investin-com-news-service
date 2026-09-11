# Monid finance assessment evidence

This is the public-evidence snapshot for the separate finance-tools report, covering 70 retrievable endpoints advertised in a category labelled as containing 71. It does not contain authenticated data responses, credentials or paid execution results.

- `catalogue.json` and `catalogue-pages.json`: captured public directory records and pagination evidence.
- `endpoint-metadata.json`: exact public detail responses for all 70 tools.
- `tools.json`: reviewed per-tool descriptions, limitations, intended platform uses and scenario profiles.
- `providers.json`: source-level coverage, provenance, permissions, freshness and audience assessments inherited by each endpoint.
- `sources.json`: primary-source registry; independent wrapper documentation is attributed to its own operator.
- `costed-tools.json`: generated default cost scenarios, including the distinct asset/fund overrides.
- `build-manifest.json`: inventory totals, source order and explicitly labelled all-tools reference costs.
- `validation.json`: completeness, price reconciliation, workbook cached-value checks and document checks.
- `review.md`: independent review scope and corrections incorporated.

From the `news-service` directory, regenerate the Markdown, CSV and formula-based Excel workbook with:

```sh
python scripts/monid/build-monid-finance-report.py
```

Export Word and PDF with:

```sh
python scripts/monid/export-monid-finance-report.py
```

The build requires `xlsxwriter`. Export requires `pandoc`, `python-docx` and local Chrome through the existing PDF renderer. Word uses native footnotes; its repeated references can receive new note numbers. The PDF exporter uses the stable unique source index in the Sources section, avoiding mismatches from suppressing repeated automatic notes.

Excel stores formulas and cached default numeric results. Values were reconciled against the scenario calculations and formulas reviewed; no Excel/LibreOffice recalculation engine was available in this environment. Open the workbook in a calculating spreadsheet application after changing assumptions. Blue cells are editable; selected-tool budget totals begin at zero until tools are selected. All-tools totals are redundant comparison scenarios, not recommended bundles or commercial quotes.

Prices and provider statements can change. A new catalogue snapshot should be reviewed before refreshing the inputs; this builder deliberately makes no network requests or paid calls. Permissions, supported-company universes, latency and production reliability must be established separately from this evidence.
