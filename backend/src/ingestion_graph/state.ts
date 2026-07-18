import { Annotation } from '@langchain/langgraph';
import { Document } from '@langchain/core/documents';
import { reduceDocs } from '../shared/state.js';

/**
 * Represents the state for document indexing and retrieval.
 *
 * This interface defines the structure of the index state, which includes
 * the documents to be indexed and the retriever used for searching
 * these documents.
 */
export const IndexStateAnnotation = Annotation.Root({
  /**
   * A list of documents that the agent can index.
   */
  docs: Annotation<
    Document[],
    Document[] | { [key: string]: any }[] | string[] | string | 'delete'
  >({
    default: () => [],
    reducer: reduceDocs,
  }),
  ingestionResult: Annotation<IngestionResult>({
    default: () => ({
      status: 'idle',
      indexedChunks: 0,
      replacedChunks: 0,
      message: '',
    }),
    reducer: (_current, update) => update,
  }),
});

export type IndexStateType = typeof IndexStateAnnotation.State;

export interface IngestionResult {
  status: 'idle' | 'success' | 'error';
  indexedChunks: number;
  replacedChunks: number;
  message: string;
}
