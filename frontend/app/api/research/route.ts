import { runResearchTask } from '@/lib/research-server';
import { ResearchTaskMode } from '@/types/research';
import { NextResponse } from 'next/server';

const MODES = new Set<ResearchTaskMode>(['auto', 'qa', 'analysis', 'ablation']);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const taskMode: ResearchTaskMode = MODES.has(body.taskMode)
      ? body.taskMode
      : 'auto';
    const response = await runResearchTask({
      query: String(body.query || body.message || ''),
      taskMode,
      projectId: String(body.projectId || 'cv-research-default'),
      threadId: body.threadId ? String(body.threadId) : undefined,
    });
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Research workflow failed:', message);
    return NextResponse.json(
      {
        error: /fetch|ECONNREFUSED|terminated/i.test(message)
          ? 'LangGraph backend is unavailable. Start or restart the backend on port 2024.'
          : message,
      },
      { status: 503 },
    );
  }
}
