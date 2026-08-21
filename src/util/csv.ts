/** Minimal RFC 4180 reader: quoted fields, escaped quotes, embedded newlines,
 *  CRLF. A dependency would do this too, but the input is one known file and
 *  keeping it here means one less thing to audit in a service that ingests
 *  supplier data. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let index = 0;

  // A UTF-8 BOM would otherwise become part of the first header name.
  if (text.charCodeAt(0) === 0xfeff) index = 1;

  for (; index < text.length; index++) {
    const char = text[index] as string;

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((value) => value.trim() !== ""));
}

/** Parse into objects keyed by the header row. */
export function parseCsvRecords(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  const header = rows.shift();
  if (!header) return [];
  const keys = header.map((key) => key.trim());
  return rows.map((row) => {
    const record: Record<string, string> = {};
    keys.forEach((key, position) => {
      record[key] = (row[position] ?? "").trim();
    });
    return record;
  });
}
