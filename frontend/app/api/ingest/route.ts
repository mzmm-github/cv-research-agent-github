import { indexConfig } from '@/constants/graphConfigs';
import {
  isSupportedResearchFile,
  processResearchArtifact,
} from '@/lib/artifacts';
import { langGraphServerClient } from '@/lib/langgraph-server';
import { Document } from '@langchain/core/documents';
import { NextRequest, NextResponse } from 'next/server';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILES = 10;

interface IngestionGraphResult {
  status: 'idle' | 'success' | 'error';
  indexedChunks: number;
  replacedChunks: number;
  message: string;
}

function safeProjectId(value: FormDataEntryValue | null): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return 'cv-research-default';
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(raw)) {
    throw new Error(
      'Project ID may only contain letters, numbers, underscores, and hyphens.',
    );
  }
  return raw;
}

export async function POST(request: NextRequest) {
  try {
    const assistantId =
      process.env.LANGGRAPH_INGESTION_ASSISTANT_ID || 'ingestion_graph';
    const formData = await request.formData();
    const projectId = safeProjectId(formData.get('projectId'));
    const files = formData
      .getAll('files')
      .filter((value): value is File => value instanceof File);

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'No research artifacts were provided.' },
        { status: 400 },
      );
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Upload at most ${MAX_FILES} files at a time.` },
        { status: 400 },
      );
    }

    const invalid = files.find(
      (file) =>
        file.size > MAX_FILE_SIZE || !isSupportedResearchFile(file.name),
    );
    if (invalid) {
      return NextResponse.json(
        {
          error: `${invalid.name} is unsupported or larger than 10MB. Supported: PDF, TXT, MD, LOG, CSV, JSON/JSONL, YAML/YML, TOML.`,
        },
        { status: 400 },
      );
    }

    const allDocuments: Document[] = [];
    const artifacts: Array<{
      filename: string;
      artifactType: string;
      fileHash: string;
      size: number;
      chunks: number;
    }> = [];
    const warnings: string[] = [];

    for (const file of files) {
      try {
        const processed = await processResearchArtifact(file, projectId);
        allDocuments.push(...processed.documents);
        artifacts.push({
          filename: processed.filename,
          artifactType: processed.artifactType,
          fileHash: processed.fileHash,
          size: processed.size,
          chunks: processed.chunks,
        });
      } catch (error) {
        warnings.push(
          `${file.name}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (allDocuments.length === 0) {
      return NextResponse.json(
        { error: 'No searchable content could be extracted.', warnings },
        { status: 400 },
      );
    }

    const thread = await langGraphServerClient.createThread({
      projectId,
      purpose: 'research-ingestion',
    });
    const finalState = (await langGraphServerClient.client.runs.wait(
      thread.thread_id,
      assistantId,
      {
        input: { docs: allDocuments },
        config: {
          configurable: { ...indexConfig },
        },
      },
    )) as { ingestionResult?: IngestionGraphResult };

    const result = finalState.ingestionResult;
    if (!result || result.status !== 'success') {
      return NextResponse.json(
        {
          error:
            result?.message || 'The ingestion graph did not return a result.',
          warnings,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      message: 'Research artifacts indexed successfully.',
      projectId,
      artifacts,
      indexedChunks: result.indexedChunks,
      replacedChunks: result.replacedChunks,
      warnings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Research ingestion failed:', message);
    return NextResponse.json(
      {
        error: message.includes('fetch')
          ? 'LangGraph backend is unavailable. Start the backend on port 2024.'
          : message,
      },
      { status: 500 },
    );
  }
}
