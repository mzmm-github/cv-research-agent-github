import { AgentConfiguration, IndexConfiguration } from '@/types/graphTypes';

type StreamConfigurables = AgentConfiguration;
type IndexConfigurables = IndexConfiguration;

export const retrievalAssistantStreamConfig: StreamConfigurables = {
  queryModel: 'google-genai/gemini-3.5-flash',
  retrieverProvider: 'supabase',
  k: 5,
};

export const researchAssistantConfig: StreamConfigurables = {
  queryModel: 'google-genai/gemini-3.5-flash',
  retrieverProvider: 'supabase',
  k: 10,
};

/**
 * The configuration for the indexing/ingestion process.
 */
export const indexConfig: IndexConfigurables = {
  useSampleDocs: false,
  retrieverProvider: 'supabase',
};
