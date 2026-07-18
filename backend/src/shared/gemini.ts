import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import type { Agent } from 'node:http';
import { createRequire } from 'node:module';
import nodeFetch from 'node-fetch';
import type { ClientOptions } from 'openai';

const require = createRequire(import.meta.url);
const createHttpsProxyAgent = require('https-proxy-agent') as (
  proxy: string,
) => Agent;
const geminiFetch = nodeFetch as unknown as NonNullable<ClientOptions['fetch']>;

const DEFAULT_GEMINI_BASE_URL =
  'https://generativelanguage.googleapis.com/v1beta/openai/';
const DEFAULT_EMBEDDING_MODEL = 'gemini-embedding-2';
const DEFAULT_EMBEDDING_DIMENSIONS = 1536;

function getGeminiApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not defined');
  }
  return apiKey;
}

function getGeminiBaseUrl(): string {
  return process.env.GEMINI_OPENAI_BASE_URL || DEFAULT_GEMINI_BASE_URL;
}

function getHttpAgent(): Agent | undefined {
  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (!proxy) return undefined;
  const proxyUrl = proxy.includes('://') ? proxy : `http://${proxy}`;
  return createHttpsProxyAgent(proxyUrl);
}

export function createGeminiChatModel(
  model: string,
  temperature: number,
): ChatOpenAI {
  const chatModel = new ChatOpenAI({
    model,
    temperature,
    timeout: 30000,
    maxRetries: 1,
    streamUsage: false,
    apiKey: getGeminiApiKey(),
    configuration: {
      baseURL: getGeminiBaseUrl(),
      httpAgent: getHttpAgent(),
      fetch: geminiFetch,
    },
  });
  // Older @langchain/openai versions inject these defaults, but Gemini's
  // OpenAI-compatible endpoint rejects them even when they are zero/one.
  Reflect.set(chatModel, 'topP', undefined);
  Reflect.set(chatModel, 'frequencyPenalty', undefined);
  Reflect.set(chatModel, 'presencePenalty', undefined);
  return chatModel;
}

export function createGeminiEmbeddings(): OpenAIEmbeddings {
  const dimensions = Number.parseInt(
    process.env.GEMINI_EMBEDDING_DIMENSIONS ||
      String(DEFAULT_EMBEDDING_DIMENSIONS),
    10,
  );
  if (!Number.isInteger(dimensions) || dimensions <= 0) {
    throw new Error('GEMINI_EMBEDDING_DIMENSIONS must be a positive integer');
  }

  return new OpenAIEmbeddings({
    model: process.env.GEMINI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL,
    dimensions,
    timeout: 30000,
    maxRetries: 1,
    apiKey: getGeminiApiKey(),
    configuration: {
      baseURL: getGeminiBaseUrl(),
      httpAgent: getHttpAgent(),
      fetch: geminiFetch,
    },
  });
}
