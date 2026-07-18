import { VectorStoreRetriever } from '@langchain/core/vectorstores';
import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { createClient } from '@supabase/supabase-js';
import { RunnableConfig } from '@langchain/core/runnables';
import { createGeminiEmbeddings } from './gemini.js';
import { Document } from '@langchain/core/documents';
import {
  BaseConfigurationAnnotation,
  ensureBaseConfiguration,
} from './configuration.js';

export async function makeSupabaseRetriever(
  configuration: typeof BaseConfigurationAnnotation.State,
): Promise<VectorStoreRetriever> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables are not defined',
    );
  }
  const embeddings = createGeminiEmbeddings();
  const supabaseClient = getSupabaseClient();
  const vectorStore = new SupabaseVectorStore(embeddings, {
    client: supabaseClient,
    tableName: 'documents',
    queryName: 'match_documents',
  });
  return vectorStore.asRetriever({
    k: configuration.k,
    filter: configuration.filterKwargs,
  });
}

export function getSupabaseClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables are not defined',
    );
  }

  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

/**
 * Find rows belonging to an older copy of the same project artifact. The IDs
 * are captured before new embeddings are written so a failed re-index never
 * destroys the last good copy.
 */
export async function findExistingArtifactIds(
  docs: Document[],
): Promise<number[]> {
  const identities = new Map<string, { projectId: string; fileHash: string }>();

  for (const doc of docs) {
    const projectId = doc.metadata?.projectId;
    const fileHash = doc.metadata?.fileHash;
    if (typeof projectId !== 'string' || typeof fileHash !== 'string') continue;
    identities.set(`${projectId}:${fileHash}`, { projectId, fileHash });
  }

  if (identities.size === 0) return [];

  const client = getSupabaseClient();
  const ids: number[] = [];
  for (const identity of identities.values()) {
    const response = await client
      .from('documents')
      .select('id')
      .contains('metadata', identity);
    if (response.error) {
      throw new Error(
        `Unable to inspect existing artifacts: ${response.error.message}`,
      );
    }
    ids.push(...(response.data ?? []).map((row) => Number(row.id)));
  }

  return [...new Set(ids)].filter(Number.isFinite);
}

export async function deleteDocumentIds(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const client = getSupabaseClient();
  const response = await client.from('documents').delete().in('id', ids);
  if (response.error) {
    throw new Error(
      `Unable to replace an existing artifact: ${response.error.message}`,
    );
  }
  return ids.length;
}

export async function makeRetriever(
  config: RunnableConfig,
): Promise<VectorStoreRetriever> {
  const configuration = ensureBaseConfiguration(config);
  switch (configuration.retrieverProvider) {
    case 'supabase':
      return makeSupabaseRetriever(configuration);
    default:
      throw new Error(
        `Unsupported retriever provider: ${configuration.retrieverProvider}`,
      );
  }
}
