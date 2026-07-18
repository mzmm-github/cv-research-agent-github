/**
 * This "graph" simply exposes an endpoint for a user to upload docs to be indexed.
 */

import { RunnableConfig } from '@langchain/core/runnables';
import { StateGraph, END, START } from '@langchain/langgraph';
import fs from 'fs/promises';

import { IndexStateAnnotation } from './state.js';
import {
  deleteDocumentIds,
  findExistingArtifactIds,
  makeRetriever,
} from '../shared/retrieval.js';
import {
  ensureIndexConfiguration,
  IndexConfigurationAnnotation,
} from './configuration.js';
import { reduceDocs } from '../shared/state.js';

async function ingestDocs(
  state: typeof IndexStateAnnotation.State,
  config?: RunnableConfig,
): Promise<typeof IndexStateAnnotation.Update> {
  try {
    if (!config) {
      return {
        docs: 'delete',
        ingestionResult: {
          status: 'error',
          indexedChunks: 0,
          replacedChunks: 0,
          message: 'Index configuration is missing.',
        },
      };
    }

    const configuration = ensureIndexConfiguration(config);
    let docs = state.docs;

    if (!docs || docs.length === 0) {
      if (configuration.useSampleDocs) {
        const fileContent = await fs.readFile(configuration.docsFile, 'utf-8');
        const serializedDocs = JSON.parse(fileContent);
        docs = reduceDocs([], serializedDocs);
      } else {
        return {
          docs: 'delete',
          ingestionResult: {
            status: 'error',
            indexedChunks: 0,
            replacedChunks: 0,
            message: 'No valid text chunks were supplied for indexing.',
          },
        };
      }
    } else {
      docs = reduceDocs([], docs).filter((doc) => doc.pageContent.trim());
    }

    if (docs.length === 0) {
      return {
        docs: 'delete',
        ingestionResult: {
          status: 'error',
          indexedChunks: 0,
          replacedChunks: 0,
          message: 'All extracted chunks were empty. OCR may be required.',
        },
      };
    }

    const existingIds = await findExistingArtifactIds(docs);
    const retriever = await makeRetriever(config);
    await retriever.addDocuments(docs);
    const replacedChunks = await deleteDocumentIds(existingIds);

    return {
      docs: 'delete',
      ingestionResult: {
        status: 'success',
        indexedChunks: docs.length,
        replacedChunks,
        message: `Indexed ${docs.length} research chunks.`,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      docs: 'delete',
      ingestionResult: {
        status: 'error',
        indexedChunks: 0,
        replacedChunks: 0,
        message,
      },
    };
  }
}

// Define the graph
const builder = new StateGraph(
  IndexStateAnnotation,
  IndexConfigurationAnnotation,
)
  .addNode('ingestDocs', ingestDocs)
  .addEdge(START, 'ingestDocs')
  .addEdge('ingestDocs', END);

// Compile into a graph object that you can invoke and deploy.
export const graph = builder
  .compile()
  .withConfig({ runName: 'IngestionGraph' });
