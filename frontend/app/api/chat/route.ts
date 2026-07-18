import { runResearchTask } from '@/lib/research-server';
import { NextResponse } from 'next/server';

/** Compatibility endpoint for older clients. New clients use /api/research. */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const response = await runResearchTask({
      query: String(body.message || body.query || ''),
      taskMode: 'auto',
      projectId: String(body.projectId || 'cv-research-default'),
      threadId: body.threadId ? String(body.threadId) : undefined,
    });
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
