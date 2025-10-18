export function parseCsvSimple(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return [];
  const headers = lines[0].split(",").map(h => h.trim());
  return lines.slice(1).filter(Boolean).map(line => {
    const cols = line.split(","); // MVP: keine Quotes/Kommas im Feld
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => (rec[h] = (cols[i] ?? "").trim()));
    return rec;
  });
}
