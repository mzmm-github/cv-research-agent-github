import { Document } from '@langchain/core/documents';
import {
  GeneratedResearchFile,
  ResearchSource,
  ResearchTask,
  ResearchTaskMode,
} from './state.js';

const ANALYSIS_TERMS = [
  '训练日志',
  '实验结果',
  '指标',
  '收敛',
  '过拟合',
  '损失',
  '最佳轮次',
  'best epoch',
  'training log',
  'metric',
  'loss',
  'accuracy',
  'precision',
  'recall',
  'map50',
  'benchmark',
];

const ABLATION_TERMS = [
  '消融',
  '实验方案',
  '对照实验',
  '变量控制',
  '超参数',
  '生成配置',
  '配置文件',
  'ablation',
  'experiment plan',
  'grid search',
  'hyperparameter',
  'yaml',
  'config',
];

export function routeResearchTask(
  query: string,
  requestedMode: ResearchTaskMode = 'auto',
): ResearchTask {
  if (requestedMode !== 'auto') return requestedMode;
  const normalized = query.toLowerCase();
  if (ABLATION_TERMS.some((term) => normalized.includes(term))) {
    return 'ablation';
  }
  if (ANALYSIS_TERMS.some((term) => normalized.includes(term))) {
    return 'analysis';
  }
  return 'qa';
}

function sourceFromDocument(doc: Document): ResearchSource {
  const page = doc.metadata?.pageNumber ?? doc.metadata?.loc?.pageNumber;
  return {
    filename: String(
      doc.metadata?.filename || doc.metadata?.source || 'unknown',
    ),
    artifactType: String(doc.metadata?.artifactType || 'reference'),
    pageNumber: Number.isFinite(Number(page)) ? Number(page) : undefined,
    chunkIndex: Number.isFinite(Number(doc.metadata?.chunkIndex))
      ? Number(doc.metadata.chunkIndex)
      : undefined,
  };
}

export function buildResearchSources(docs: Document[]): ResearchSource[] {
  const unique = new Map<string, ResearchSource>();
  for (const doc of docs) {
    const source = sourceFromDocument(doc);
    const key = `${source.filename}:${source.pageNumber ?? ''}:${source.chunkIndex ?? ''}`;
    if (!unique.has(key)) unique.set(key, source);
  }
  return [...unique.values()].slice(0, 12);
}

export function formatResearchContext(
  docs: Document[],
  maxCharacters = 28000,
): string {
  if (docs.length === 0) {
    return '[No matching project artifacts were retrieved.]';
  }

  const blocks: string[] = [];
  let used = 0;
  for (const doc of docs) {
    const source = sourceFromDocument(doc);
    const label = [
      source.filename,
      source.artifactType,
      source.pageNumber ? `page ${source.pageNumber}` : undefined,
      source.chunkIndex !== undefined
        ? `chunk ${source.chunkIndex}`
        : undefined,
    ]
      .filter(Boolean)
      .join(' | ');
    const remaining = maxCharacters - used;
    if (remaining <= 0) break;
    const content = doc.pageContent.trim().slice(0, Math.min(4500, remaining));
    const block = `<artifact source="${label}">\n${content}\n</artifact>`;
    blocks.push(block);
    used += block.length;
  }
  return blocks.join('\n\n');
}

export function normalizeModelContent(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return String(content ?? '').trim();
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && 'text' in part) {
        return String((part as { text: unknown }).text);
      }
      return '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

export function extractGeneratedFiles(
  markdown: string,
): GeneratedResearchFile[] {
  const files: GeneratedResearchFile[] = [];
  const expression = /```(yaml|yml|json|toml|python|bash)\s*\n([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(markdown)) !== null) {
    const language = match[1].toLowerCase();
    const extension = language === 'yml' ? 'yaml' : language;
    files.push({
      filename:
        files.length === 0
          ? `ablation_plan.${extension}`
          : `experiment_artifact_${files.length + 1}.${extension}`,
      language,
      content: match[2].trim(),
    });
  }
  return files;
}

export function buildFallbackAblationConfig(query: string): string {
  const safeGoal = query
    .replace(/[\r\n]+/g, ' ')
    .replace(/"/g, "'")
    .slice(0, 240);
  return [
    'experiment:',
    '  name: cv_ablation_study',
    `  objective: "${safeGoal}"`,
    '  seeds: [17, 29, 43]',
    '  primary_metric: mAP50_95',
    '  secondary_metrics: [precision, recall, latency_ms, params_m]',
    'baseline:',
    '  config: configs/baseline.yaml',
    'factors:',
    '  - name: component_enabled',
    '    values: [false, true]',
    'protocol:',
    '  epochs: 100',
    '  early_stopping_patience: 20',
    '  keep_data_split_fixed: true',
    '  keep_augmentation_fixed: true',
    'output:',
    '  directory: runs/ablation',
    '  save_best_only: true',
  ].join('\n');
}
