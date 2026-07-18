import { Annotation } from '@langchain/langgraph';
import { Document } from '@langchain/core/documents';
import { reduceDocs } from '../shared/state.js';

export type ResearchTask = 'qa' | 'analysis' | 'ablation';
export type ResearchTaskMode = ResearchTask | 'auto';

export interface ResearchSource {
  filename: string;
  artifactType: string;
  pageNumber?: number;
  chunkIndex?: number;
}

export interface GeneratedResearchFile {
  filename: string;
  language: string;
  content: string;
}

export interface ResearchResult {
  status: 'idle' | 'success' | 'error';
  task: ResearchTask;
  title: string;
  summary: string;
  markdown: string;
  sources: ResearchSource[];
  generatedFiles: GeneratedResearchFile[];
  warning?: string;
}

const idleResult = (): ResearchResult => ({
  status: 'idle',
  task: 'qa',
  title: '',
  summary: '',
  markdown: '',
  sources: [],
  generatedFiles: [],
});

export const ResearchStateAnnotation = Annotation.Root({
  query: Annotation<string>(),
  taskMode: Annotation<ResearchTaskMode>(),
  projectId: Annotation<string>(),
  route: Annotation<ResearchTask>(),
  retrievalError: Annotation<string>({
    default: () => '',
    reducer: (_current, update) => update,
  }),
  documents: Annotation<
    Document[],
    Document[] | { [key: string]: unknown }[] | string[] | string | 'delete'
  >({
    default: () => [],
    // The shared reducer also assigns stable UUIDs to retrieved chunks.
    // @ts-ignore
    reducer: reduceDocs,
  }),
  result: Annotation<ResearchResult>({
    default: idleResult,
    reducer: (_current, update) => update,
  }),
});

export type ResearchState = typeof ResearchStateAnnotation.State;
