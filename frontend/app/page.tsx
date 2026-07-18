'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  GeneratedResearchFile,
  ResearchResult,
  ResearchTask,
  UploadedArtifact,
} from '@/types/research';
import {
  Activity,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  Database,
  Download,
  FileCode2,
  FileSearch,
  FileText,
  FlaskConical,
  FolderKanban,
  Layers3,
  LoaderCircle,
  Play,
  Search,
  Sparkles,
  UploadCloud,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

const TASKS: Array<{
  id: ResearchTask;
  title: string;
  shortTitle: string;
  description: string;
  icon: typeof FileSearch;
  accent: string;
  examples: string[];
}> = [
  {
    id: 'qa',
    title: '论文与项目资料问答',
    shortTitle: '资料问答',
    description: '跨论文、README、模型配置与项目笔记检索并给出可追溯回答。',
    icon: FileSearch,
    accent: 'from-cyan-500/20 to-blue-500/10 text-cyan-700',
    examples: [
      '总结当前模型的核心创新，并指出证据来自哪些资料。',
      '配置文件中的输入尺寸、优化器和学习率分别是什么？',
    ],
  },
  {
    id: 'analysis',
    title: '训练日志与实验分析',
    shortTitle: '实验分析',
    description: '比较指标、识别收敛与过拟合、定位异常并推荐最佳 checkpoint。',
    icon: BarChart3,
    accent: 'from-violet-500/20 to-fuchsia-500/10 text-violet-700',
    examples: [
      '分析训练是否收敛，找出最佳 epoch，并说明过拟合风险。',
      '比较各实验的 mAP、延迟和参数量，给出 Pareto 最优选择。',
    ],
  },
  {
    id: 'ablation',
    title: '消融实验规划与配置生成',
    shortTitle: '消融规划',
    description: '形成假设、变量矩阵、评估协议，并输出可下载 YAML 配置。',
    icon: FlaskConical,
    accent: 'from-amber-500/20 to-orange-500/10 text-amber-700',
    examples: [
      '为注意力模块、损失函数和输入分辨率设计一套正交消融实验。',
      '在 8 张 GPU、72 小时预算内生成优先级最高的消融配置。',
    ],
  },
];

const ARTIFACT_LABELS: Record<string, string> = {
  paper: '论文',
  project_note: '项目资料',
  model_config: '模型配置',
  training_log: '训练日志',
  experiment_metrics: '实验指标',
};

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function MarkdownResult({ content }: { content: string }) {
  const blocks: Array<{
    kind: 'text' | 'code';
    value: string;
    language?: string;
  }> = [];
  const expression = /```(\w+)?\s*\n([\s\S]*?)```/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(content)) !== null) {
    if (match.index > cursor) {
      blocks.push({ kind: 'text', value: content.slice(cursor, match.index) });
    }
    blocks.push({ kind: 'code', value: match[2].trim(), language: match[1] });
    cursor = expression.lastIndex;
  }
  if (cursor < content.length)
    blocks.push({ kind: 'text', value: content.slice(cursor) });

  return (
    <div className="space-y-4 text-[15px] leading-7 text-slate-700">
      {blocks.map((block, index) =>
        block.kind === 'code' ? (
          <div
            key={index}
            className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950"
          >
            <div className="border-b border-slate-800 px-4 py-2 text-xs uppercase tracking-[0.18em] text-slate-400">
              {block.language || 'code'}
            </div>
            <pre className="overflow-x-auto p-4 text-sm leading-6 text-cyan-100">
              <code>{block.value}</code>
            </pre>
          </div>
        ) : (
          <div key={index} className="whitespace-pre-wrap">
            {block.value.trim()}
          </div>
        ),
      )}
    </div>
  );
}

export default function Home() {
  const { toast } = useToast();
  const [projectId, setProjectId] = useState('cv-research-default');
  const [task, setTask] = useState<ResearchTask>('qa');
  const [query, setQuery] = useState(TASKS[0].examples[0]);
  const [artifacts, setArtifacts] = useState<UploadedArtifact[]>([]);
  const [threadId, setThreadId] = useState<string>();
  const [result, setResult] = useState<ResearchResult>();
  const [history, setHistory] = useState<ResearchResult[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem('cv-research-project');
    if (stored && /^[a-zA-Z0-9_-]{1,80}$/.test(stored)) setProjectId(stored);
  }, []);

  const currentTask = TASKS.find((item) => item.id === task) || TASKS[0];
  const indexedChunks = useMemo(
    () => artifacts.reduce((sum, artifact) => sum + artifact.chunks, 0),
    [artifacts],
  );

  const selectTask = (nextTask: ResearchTask) => {
    setTask(nextTask);
    const definition = TASKS.find((item) => item.id === nextTask) || TASKS[0];
    setQuery(definition.examples[0]);
    setResult(undefined);
  };

  const handleProjectChange = (value: string) => {
    const normalized = value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
    setProjectId(normalized);
    setThreadId(undefined);
    setArtifacts([]);
    setResult(undefined);
    window.localStorage.setItem(
      'cv-research-project',
      normalized || 'cv-research-default',
    );
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    setIsUploading(true);
    try {
      const form = new FormData();
      form.append('projectId', projectId || 'cv-research-default');
      files.forEach((file) => form.append('files', file));
      const response = await fetch('/api/ingest', {
        method: 'POST',
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '资料入库失败');

      setArtifacts((previous) => {
        const next = new Map(
          previous.map((artifact) => [artifact.fileHash, artifact]),
        );
        (data.artifacts as UploadedArtifact[]).forEach((artifact) =>
          next.set(artifact.fileHash, artifact),
        );
        return [...next.values()];
      });
      toast({
        title: '资料已入库',
        description: `新增 ${data.indexedChunks} 个分块，替换 ${data.replacedChunks} 个旧分块。`,
      });
      if (data.warnings?.length) {
        toast({
          title: '部分文件未处理',
          description: data.warnings.join('\n'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: '资料入库失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const runWorkflow = async () => {
    if (!query.trim() || isRunning) return;
    setIsRunning(true);
    setResult(undefined);
    try {
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          taskMode: task,
          projectId: projectId || 'cv-research-default',
          threadId,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '科研工作流执行失败');
      setThreadId(data.threadId);
      setResult(data.result);
      setHistory((previous) => [data.result, ...previous].slice(0, 6));
      if (data.result.status === 'error') {
        toast({
          title: '任务已安全停止',
          description: data.result.summary,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: '工作流执行失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setIsRunning(false);
    }
  };

  const downloadFile = (file: GeneratedResearchFile) => {
    const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-5 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-cyan-300 shadow-lg shadow-slate-300">
              <BrainCircuit className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight">
                CV Research Agent
              </p>
              <p className="text-xs text-slate-500">
                LangGraph · Gemini · Supabase RAG
              </p>
            </div>
          </div>
          <div className="hidden items-center gap-2 text-xs text-slate-500 sm:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" />
            Research workspace
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1500px] gap-6 px-5 py-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:px-8">
        <aside className="space-y-5">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2 text-slate-500">
                <FolderKanban className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-[0.16em]">
                  Project
                </span>
              </div>
              <CardTitle className="text-base">科研项目空间</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">
                  项目 ID
                </label>
                <Input
                  value={projectId}
                  onChange={(event) => handleProjectChange(event.target.value)}
                  className="h-10 bg-slate-50 font-mono text-xs"
                />
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.txt,.md,.log,.csv,.json,.jsonl,.yaml,.yml,.toml"
                className="hidden"
                onChange={handleUpload}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="group flex w-full flex-col items-center rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-6 text-center transition hover:border-cyan-400 hover:bg-cyan-50/50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isUploading ? (
                  <LoaderCircle className="mb-3 h-7 w-7 animate-spin text-cyan-600" />
                ) : (
                  <UploadCloud className="mb-3 h-7 w-7 text-slate-400 transition group-hover:text-cyan-600" />
                )}
                <span className="text-sm font-semibold">
                  {isUploading ? '正在解析与向量化…' : '上传科研资料'}
                </span>
                <span className="mt-1 text-xs leading-5 text-slate-500">
                  PDF / MD / 配置 / LOG / CSV / JSON
                  <br />
                  单文件不超过 10MB
                </span>
              </button>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">已索引资料</CardTitle>
                <Badge variant="secondary">{artifacts.length}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {artifacts.length === 0 ? (
                <div className="rounded-lg bg-slate-50 px-3 py-5 text-center text-xs leading-5 text-slate-500">
                  上传论文、配置或训练日志后，Agent 会在当前项目范围内检索。
                </div>
              ) : (
                <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                  {artifacts.map((artifact) => (
                    <div
                      key={artifact.fileHash}
                      className="rounded-lg border border-slate-200 bg-white p-3"
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 rounded-lg bg-slate-100 p-2 text-slate-600">
                          {artifact.artifactType === 'model_config' ? (
                            <FileCode2 className="h-4 w-4" />
                          ) : (
                            <FileText className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className="truncate text-xs font-semibold"
                            title={artifact.filename}
                          >
                            {artifact.filename}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {ARTIFACT_LABELS[artifact.artifactType] ||
                              artifact.artifactType}{' '}
                            · {artifact.chunks} chunks ·{' '}
                            {formatBytes(artifact.size)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </aside>

        <section className="min-w-0 space-y-6">
          <div className="overflow-hidden rounded-2xl bg-slate-950 px-6 py-7 text-white shadow-xl shadow-slate-300/60 md:px-8">
            <div className="relative z-10 grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
              <div>
                <Badge className="mb-4 border-cyan-400/20 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/10">
                  <Sparkles className="mr-1.5 h-3 w-3" /> Research orchestration
                </Badge>
                <h1 className="max-w-3xl text-2xl font-semibold tracking-tight md:text-3xl">
                  从资料检索到实验决策的计算机视觉科研工作流
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
                  统一理解论文、模型配置、训练日志与实验指标，输出有证据的分析、可执行的实验矩阵和配置文件。
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-lg font-semibold">{artifacts.length}</p>
                  <p className="text-[10px] uppercase tracking-wider text-slate-400">
                    Artifacts
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-lg font-semibold">{indexedChunks}</p>
                  <p className="text-[10px] uppercase tracking-wider text-slate-400">
                    Chunks
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-lg font-semibold">3</p>
                  <p className="text-[10px] uppercase tracking-wider text-slate-400">
                    Workflows
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {TASKS.map((item) => {
              const Icon = item.icon;
              const active = item.id === task;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectTask(item.id)}
                  className={`rounded-xl border p-4 text-left transition ${
                    active
                      ? 'border-slate-900 bg-white shadow-md shadow-slate-200'
                      : 'border-slate-200 bg-white/70 hover:border-slate-300 hover:bg-white'
                  }`}
                >
                  <div
                    className={`mb-3 inline-flex rounded-lg bg-gradient-to-br p-2 ${item.accent}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-semibold">{item.shortTitle}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                    {item.description}
                  </p>
                </button>
              );
            })}
          </div>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 pb-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-base">
                    {currentTask.title}
                  </CardTitle>
                  <p className="mt-1 text-xs text-slate-500">
                    {currentTask.description}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="shrink-0 font-mono text-[10px] uppercase"
                >
                  LangGraph · {task}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
              <Textarea
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="min-h-[130px] resize-y border-slate-200 bg-slate-50/60 text-sm leading-6 focus-visible:ring-cyan-500"
                placeholder="描述你的研究问题、分析目标或消融约束…"
              />
              <div className="flex flex-wrap gap-2">
                {currentTask.examples.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setQuery(example)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-left text-[11px] text-slate-600 transition hover:border-cyan-300 hover:text-cyan-700"
                  >
                    {example}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Database className="h-3.5 w-3.5" />
                  仅检索项目{' '}
                  <span className="font-mono text-slate-700">{projectId}</span>
                </div>
                <Button
                  onClick={runWorkflow}
                  disabled={!query.trim() || isRunning}
                  className="bg-slate-950 px-5 text-white hover:bg-slate-800"
                >
                  {isRunning ? (
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="mr-2 h-4 w-4" />
                  )}
                  {isRunning ? 'Agent 执行中' : '运行工作流'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="min-h-[280px] border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-cyan-600" />
                  <CardTitle className="text-base">Agent 输出</CardTitle>
                </div>
                {result && (
                  <Badge
                    variant="outline"
                    className={
                      result.status === 'success'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-red-200 bg-red-50 text-red-700'
                    }
                  >
                    {result.status === 'success' ? (
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                    ) : (
                      <X className="mr-1 h-3 w-3" />
                    )}
                    {result.status}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {isRunning ? (
                <div className="flex min-h-[210px] flex-col items-center justify-center text-center">
                  <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
                    <Layers3 className="h-6 w-6" />
                    <span className="absolute -right-1 -top-1 h-3 w-3 animate-pulse rounded-full bg-cyan-500" />
                  </div>
                  <p className="text-sm font-semibold">
                    正在检索证据并执行科研工作流
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    路由 → RAG 检索 → 任务推理 → 结构化输出
                  </p>
                </div>
              ) : result ? (
                <div className="space-y-6">
                  <div>
                    <h2 className="mb-4 text-lg font-semibold">
                      {result.title}
                    </h2>
                    <MarkdownResult content={result.markdown} />
                  </div>

                  {result.generatedFiles.length > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-amber-800">
                        Generated configurations
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {result.generatedFiles.map((file) => (
                          <Button
                            key={file.filename}
                            variant="outline"
                            size="sm"
                            onClick={() => downloadFile(file)}
                            className="border-amber-300 bg-white text-amber-900"
                          >
                            <Download className="mr-2 h-3.5 w-3.5" />
                            {file.filename}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {result.sources.length > 0 && (
                    <div className="border-t border-slate-100 pt-4">
                      <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        <Search className="h-3.5 w-3.5" /> Retrieved evidence
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {result.sources.map((source, index) => (
                          <span
                            key={`${source.filename}-${source.pageNumber}-${source.chunkIndex}-${index}`}
                            className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-600"
                          >
                            {source.filename}
                            {source.pageNumber
                              ? ` · p.${source.pageNumber}`
                              : ''}
                            {source.chunkIndex !== undefined
                              ? ` · #${source.chunkIndex}`
                              : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex min-h-[210px] flex-col items-center justify-center text-center text-slate-500">
                  <BrainCircuit className="mb-3 h-7 w-7 text-slate-300" />
                  <p className="text-sm font-medium text-slate-600">
                    等待科研任务
                  </p>
                  <p className="mt-1 max-w-md text-xs leading-5">
                    上传资料后选择工作流；没有资料时也可以先生成实验方案模板。
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {history.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              <span className="shrink-0 text-xs font-medium text-slate-500">
                最近任务
              </span>
              {history.slice(1).map((item, index) => (
                <button
                  key={`${item.title}-${index}`}
                  type="button"
                  onClick={() => setResult(item)}
                  className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:border-slate-300"
                >
                  {item.title}
                </button>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
