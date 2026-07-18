import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { createHash, randomUUID } from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

export type ArtifactType =
  | 'paper'
  | 'project_note'
  | 'model_config'
  | 'training_log'
  | 'experiment_metrics';

export interface ProcessedResearchArtifact {
  filename: string;
  artifactType: ArtifactType;
  fileHash: string;
  size: number;
  chunks: number;
  documents: Document[];
}

const SUPPORTED_EXTENSIONS = new Set([
  '.pdf',
  '.txt',
  '.md',
  '.log',
  '.csv',
  '.json',
  '.jsonl',
  '.yaml',
  '.yml',
  '.toml',
]);

const MAX_TEXT_CHARACTERS = 1_500_000;
const MAX_CHUNKS_PER_FILE = 240;

export function isSupportedResearchFile(filename: string): boolean {
  return SUPPORTED_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

export function detectArtifactType(filename: string): ArtifactType {
  const lower = filename.toLowerCase();
  const extension = path.extname(lower);
  if (extension === '.pdf') return 'paper';
  if (['.yaml', '.yml', '.toml'].includes(extension)) return 'model_config';
  if (extension === '.log' || extension === '.jsonl') return 'training_log';
  if (extension === '.csv') return 'experiment_metrics';
  if (extension === '.json') {
    if (/(config|model|hyp|param|setting)/.test(lower)) return 'model_config';
    if (/(metric|result|history|eval|train)/.test(lower)) {
      return 'experiment_metrics';
    }
  }
  if (/(paper|manuscript|论文|文献)/.test(lower)) return 'paper';
  return 'project_note';
}

function canonicalMetricName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s/-]+/g, '_')
    .replace('learning_rate', 'lr')
    .replace('validation_loss', 'val_loss')
    .replace('training_loss', 'train_loss');
}

interface MetricAggregate {
  count: number;
  first: number;
  last: number;
  min: number;
  max: number;
}

function addMetric(
  aggregates: Record<string, MetricAggregate>,
  name: string,
  value: number,
) {
  if (!Number.isFinite(value)) return;
  const key = canonicalMetricName(name);
  const current = aggregates[key];
  if (!current) {
    aggregates[key] = {
      count: 1,
      first: value,
      last: value,
      min: value,
      max: value,
    };
    return;
  }
  current.count += 1;
  current.last = value;
  current.min = Math.min(current.min, value);
  current.max = Math.max(current.max, value);
}

function summarizeCsv(text: string): Record<string, MetricAggregate> {
  const aggregates: Record<string, MetricAggregate> = {};
  const lines = text.split(/\r?\n/).filter(Boolean).slice(0, 100_000);
  if (lines.length < 2) return aggregates;
  const headers = lines[0]
    .split(',')
    .map((header) => header.trim().replace(/^"|"$/g, ''));
  for (const line of lines.slice(1)) {
    const values = line.split(',');
    for (
      let index = 0;
      index < Math.min(headers.length, values.length);
      index += 1
    ) {
      const value = Number.parseFloat(
        values[index].replace(/^"|"$/g, '').trim(),
      );
      if (Number.isFinite(value)) addMetric(aggregates, headers[index], value);
    }
  }
  return aggregates;
}

export function buildMetricSummary(
  text: string,
  filename: string,
): string | null {
  const extension = path.extname(filename).toLowerCase();
  const aggregates = extension === '.csv' ? summarizeCsv(text) : {};
  const metricPattern =
    /\b(epoch|step|iteration|iter|train[\s_/-]?loss|val(?:idation)?[\s_/-]?loss|loss|accuracy|acc|precision|recall|f1|map50(?:[-_]?95)?|map|lr|learning[\s_/-]?rate|latency(?:_ms)?|fps)\b\s*[=:,]?\s*(-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)/gi;
  const lines = text.split(/\r?\n/).slice(0, 100_000);
  for (const line of lines) {
    let match: RegExpExecArray | null;
    metricPattern.lastIndex = 0;
    while ((match = metricPattern.exec(line)) !== null) {
      addMetric(aggregates, match[1], Number.parseFloat(match[2]));
    }
  }

  const entries = Object.entries(aggregates).filter(
    ([, value]) => value.count >= 2,
  );
  if (entries.length === 0) return null;
  return JSON.stringify(
    {
      kind: 'metric_summary',
      source: filename,
      metrics: Object.fromEntries(entries),
      interpretation: {
        loss_metrics: 'lower is usually better',
        accuracy_precision_recall_map_fps: 'higher is usually better',
        latency: 'lower is usually better',
      },
    },
    null,
    2,
  );
}

function cleanText(buffer: Buffer): string {
  const text = buffer.toString('utf8').replace(/\u0000/g, '');
  if (!text.trim())
    throw new Error('The file does not contain readable UTF-8 text.');
  if (text.length > MAX_TEXT_CHARACTERS) {
    throw new Error(
      `Text artifact is too large after decoding (${text.length.toLocaleString()} characters; limit ${MAX_TEXT_CHARACTERS.toLocaleString()}).`,
    );
  }
  return text;
}

async function splitDocumentText(
  text: string,
  metadata: Record<string, unknown>,
): Promise<Document[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 3200,
    chunkOverlap: 260,
  });
  const docs = await splitter.createDocuments([text], [metadata]);
  return docs
    .filter((doc) => doc.pageContent.trim())
    .map(
      (doc, index) =>
        new Document({
          pageContent: doc.pageContent.trim(),
          metadata: { ...metadata, ...doc.metadata, chunkIndex: index },
        }),
    );
}

async function parsePdf(
  buffer: Buffer,
  filename: string,
  metadata: Record<string, unknown>,
): Promise<Document[]> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cv-research-pdf-'));
  const safeName = path.basename(filename).replace(/[^\p{L}\p{N}._-]+/gu, '_');
  const tempPath = path.join(tempDir, safeName || 'artifact.pdf');
  try {
    await fs.writeFile(tempPath, buffer);
    const pages = await new PDFLoader(tempPath).load();
    const docs: Document[] = [];
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
      const pageContent = pages[pageIndex].pageContent.trim();
      if (!pageContent) continue;
      const pageDocs = await splitDocumentText(pageContent, {
        ...metadata,
        pageNumber: pageIndex + 1,
      });
      docs.push(...pageDocs);
    }
    if (docs.length === 0) {
      throw new Error(
        'No searchable text was extracted from this PDF. Run OCR first.',
      );
    }
    return docs;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export async function processResearchArtifact(
  file: File,
  projectId: string,
): Promise<ProcessedResearchArtifact> {
  if (!isSupportedResearchFile(file.name)) {
    throw new Error(
      `Unsupported research artifact type: ${path.extname(file.name) || 'unknown'}`,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileHash = createHash('sha256').update(buffer).digest('hex');
  const artifactType = detectArtifactType(file.name);
  const ingestionId = randomUUID();
  const metadata = {
    projectId,
    fileHash,
    ingestionId,
    filename: file.name,
    source: file.name,
    artifactType,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
  };

  let documents: Document[];
  if (path.extname(file.name).toLowerCase() === '.pdf') {
    documents = await parsePdf(buffer, file.name, metadata);
  } else {
    const text = cleanText(buffer);
    documents = await splitDocumentText(text, metadata);
    if (
      artifactType === 'training_log' ||
      artifactType === 'experiment_metrics'
    ) {
      const summary = buildMetricSummary(text, file.name);
      if (summary) {
        documents.unshift(
          new Document({
            pageContent: `Structured metric summary for ${file.name}:\n${summary}`,
            metadata: {
              ...metadata,
              chunkKind: 'metric_summary',
              chunkIndex: -1,
            },
          }),
        );
      }
    }
  }

  if (documents.length > MAX_CHUNKS_PER_FILE) {
    throw new Error(
      `Artifact produced ${documents.length} chunks; the per-file limit is ${MAX_CHUNKS_PER_FILE}. Split the file or keep only the relevant log range.`,
    );
  }

  return {
    filename: file.name,
    artifactType,
    fileHash,
    size: file.size,
    chunks: documents.length,
    documents,
  };
}
