#!/usr/bin/env bash
# Render docs/REPORT.md to docs/News-Service-Report.pdf.
#
# Two things this handles that a naive pandoc|chrome pipeline gets wrong:
#
#   1. Relative links to sibling .md files are useless in a PDF, and Chrome
#      resolves them against the HTML's own location - baking the build
#      directory into the output as a file:// annotation. They are stripped.
#   2. Chrome also records the source HTML's path in the PDF, so the render
#      happens in a scratch directory created by mktemp, not wherever the
#      author happened to be working.
#
# The script fails if any file:// reference survives into the PDF.
set -euo pipefail

cd "$(dirname "$0")/.."
SRC="docs/REPORT.md"
OUT="docs/News-Service-Report.pdf"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

command -v pandoc >/dev/null || { echo "pandoc is required"; exit 1; }
[ -x "$CHROME" ] || { echo "Google Chrome not found at $CHROME"; exit 1; }

BUILD="$(mktemp -d)"
trap 'rm -rf "$BUILD"' EXIT

cat > "$BUILD/style.html" <<'CSS'
<style>
@page { size: A4; margin: 12mm 12mm 14mm; }
* { box-sizing: border-box; }
html, body { max-width: none !important; margin:0 !important; padding:0 !important;
  font: 9.05pt/1.42 -apple-system,"Segoe UI",Helvetica,Arial,sans-serif !important;
  color:#14181f; background:#fff; }
#title-block-header { display:none !important; }
h1 { font-size:18pt; margin:0 0 4px; letter-spacing:-.5px; font-weight:700; }
h2 { font-size:10.6pt; margin:13px 0 5px; padding-bottom:3px;
     border-bottom:1.5px solid #14181f; page-break-after:avoid; font-weight:700; }
p { margin:0 0 6px; }
hr { display:none; }
table { width:100% !important; border-collapse:collapse; margin:6px 0 9px;
        font-size:8.35pt; page-break-inside:avoid; }
th,td { text-align:left; padding:3.5px 7px; border-bottom:1px solid #dde2e8; vertical-align:top; }
th { background:#f4f6f8; font-weight:600; }
code { font-family:ui-monospace,Menlo,monospace; font-size:7.9pt; background:#f0f2f5;
       padding:0 3px; border-radius:3px; }
ul,ol { margin:0 0 7px; padding-left:16px; } li { margin-bottom:3.5px; }
ol li { margin-bottom:4.5px; }
strong { font-weight:650; } em { font-style:italic; }
a { color:#14181f; text-decoration:none; }
img { max-width:100%; height:auto; display:block; margin:7px 0 3px;
      border:1px solid #dde2e8; border-radius:3px; page-break-inside:avoid; }
img + em, p > em:only-child { font-size:7.9pt; color:#5a6472; display:block; margin-bottom:9px; }
</style>
CSS

# Images are referenced relatively from docs/REPORT.md, and the render happens
# in $BUILD, so they have to travel with the HTML or they silently vanish.
[ -d docs/screenshots ] && cp -R docs/screenshots "$BUILD/screenshots"

pandoc "$SRC" -f gfm -t html5 -s -H "$BUILD/style.html" -o "$BUILD/report.html"

# Drop anchors to anything that is not http(s). Pandoc wraps long tags across
# newlines, so the whitespace between `<a` and `href` must be \s+, not a space.
python3 - "$BUILD/report.html" <<'PY'
import re, sys, io
path = sys.argv[1]
html = io.open(path, encoding="utf-8").read()
html = re.sub(r'<a\s+[^>]*?href="(?!https?://)[^"]*"[^>]*>(.*?)</a>', r'\1', html, flags=re.S)
leftover = re.findall(r'<a\s+[^>]*?href="(?!https?://)', html)
if leftover:
    sys.exit(f"{len(leftover)} local anchors survived stripping")
io.open(path, "w", encoding="utf-8").write(html)
PY

"$CHROME" --headless --disable-gpu --no-pdf-header-footer \
  --run-all-compositor-stages-before-draw --virtual-time-budget=4000 \
  --print-to-pdf="$BUILD/report.pdf" "file://$BUILD/report.html" 2>/dev/null

# A local path in a distributed PDF leaks the build environment. Fail loudly.
if strings "$BUILD/report.pdf" | grep -q 'file:///'; then
  echo "FAIL: the PDF still references a local path:"
  strings "$BUILD/report.pdf" | grep -o 'file:///[^)]*' | sort -u
  exit 1
fi

cp "$BUILD/report.pdf" "$OUT"
echo "wrote $OUT ($(wc -c < "$OUT" | tr -d ' ') bytes)"
