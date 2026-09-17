type ReportNarrative = {
  executiveSummary: string;
  topThemes: Array<{ name: string; insight: string }>;
  sentimentShifts: string[];
  notableQuotes: Array<{ quote: string; sourceId: string }>;
  recommendedActions: string[];
  supportingEvidence: string[];
};

export type PdfReport = {
  title: string;
  periodStart: Date;
  periodEnd: Date;
  createdAt: Date;
  contentJson: ReportNarrative;
};

const PAGE_HEIGHT = 792;
const TOP = 56;
const BOTTOM = 54;
const LEADING = 14;
const MAX_CHARS = 94;

function pdfText(value: string) {
  return value.normalize("NFKD").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u2013\u2014]/g, "-").replace(/[^\x20-\x7e\n\r\t]/g, "?").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrap(value: string) {
  const words = value.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (!line && word.length > MAX_CHARS) {
      for (let index = 0; index < word.length; index += MAX_CHARS) lines.push(word.slice(index, index + MAX_CHARS));
      continue;
    }
    if (line && `${line} ${word}`.length > MAX_CHARS) { lines.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

function addSection(lines: string[], heading: string, values: string[]) {
  lines.push(heading, "");
  for (const value of values) { for (const line of wrap(value)) lines.push(`- ${line}`); lines.push(""); }
}

function reportLines(report: PdfReport) {
  const content = report.contentJson;
  const lines = [report.title, `Report period: ${report.periodStart.toISOString().slice(0, 10)} to ${report.periodEnd.toISOString().slice(0, 10)}`, `Created: ${report.createdAt.toISOString().slice(0, 10)}`, "", "Executive summary", "", ...wrap(content.executiveSummary), ""];
  addSection(lines, "VoC findings / top themes", content.topThemes.map((theme) => `${theme.name}: ${theme.insight}`));
  addSection(lines, "Sentiment and classification", content.sentimentShifts);
  addSection(lines, "Notable quotes", content.notableQuotes.map((item) => `\"${item.quote}\" (source: ${item.sourceId})`));
  addSection(lines, "Recommendations / actions", content.recommendedActions);
  addSection(lines, "Supporting evidence / insights", content.supportingEvidence);
  return lines;
}

export function createReportPdf(report: PdfReport) {
  const linesPerPage = Math.floor((PAGE_HEIGHT - TOP - BOTTOM) / LEADING);
  const allLines = reportLines(report);
  const pages: string[][] = [];
  for (let index = 0; index < allLines.length; index += linesPerPage) pages.push(allLines.slice(index, index + linesPerPage));

  const objects: string[] = ["<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  const pageObjectIds: number[] = [];
  const contentObjectIds: number[] = [];
  for (const pageLines of pages) {
    pageObjectIds.push(objects.length + 1); objects.push("");
    contentObjectIds.push(objects.length + 1);
    const commands = ["BT", "/F1 10 Tf", `54 ${PAGE_HEIGHT - TOP} Td`];
    pageLines.forEach((line, index) => { if (index > 0) commands.push(`0 -${LEADING} Td`); if (line) commands.push(`(${pdfText(line)}) Tj`); });
    commands.push("ET");
    const stream = commands.join("\n");
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  objects[1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`;
  pageObjectIds.forEach((id, index) => { objects[id - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectIds[index]} 0 R >>`; });

  // Keep the header ASCII so xref offsets remain byte-accurate after encoding.
  let pdf = "%PDF-1.4\n%----\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index++) pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
