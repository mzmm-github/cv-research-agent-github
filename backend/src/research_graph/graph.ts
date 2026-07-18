import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { RunnableConfig } from '@langchain/core/runnables';
import { END, START, StateGraph } from '@langchain/langgraph';
import {
  AgentConfigurationAnnotation,
  ensureAgentConfiguration,
} from '../retrieval_graph/configuration.js';
import { makeRetriever } from '../shared/retrieval.js';
import { loadChatModel } from '../shared/utils.js';
import { buildResearchPrompt } from './prompts.js';
import {
  ResearchResult,
  ResearchStateAnnotation,
  ResearchTask,
} from './state.js';
import {
  buildFallbackAblationConfig,
  buildResearchSources,
  extractGeneratedFiles,
  formatResearchContext,
  normalizeModelContent,
  routeResearchTask,
} from './utils.js';

interface ResearchModelResponse {
  content: unknown;
  warning?: string;
}

function isTransientModelError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /429|rate.?limit|resource.?exhausted|503|overload|temporar|timeout|econnreset|fetch failed/i.test(
    message,
  );
}

function fallbackModelName(primaryModel: string): string | null {
  if (!primaryModel.startsWith('google-genai/')) return null;
  const configured =
    process.env.GEMINI_FALLBACK_CHAT_MODEL || 'gemini-3.1-flash-lite';
  const fallback = configured.includes('/')
    ? configured
    : `google-genai/${configured}`;
  return fallback === primaryModel ? null : fallback;
}

async function invokeResearchModel(
  primaryModel: string,
  prompt: string,
): Promise<ResearchModelResponse> {
  const fallback = fallbackModelName(primaryModel);
  const candidates = fallback ? [primaryModel, fallback] : [primaryModel];
  let primaryFailure = '';

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    try {
      const model = await loadChatModel(candidate, 0.1);
      const response = await model.invoke([
        new SystemMessage(
          'You are a dependable computer vision research workflow agent. Return only the requested research deliverable.',
        ),
        new HumanMessage(prompt),
      ]);
      return {
        content: response.content,
        warning:
          index > 0
            ? `The primary model was temporarily unavailable (${primaryFailure}); ${candidate} completed this task.`
            : undefined,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (index === 0) primaryFailure = message.split('\n')[0];
      const canFallback = index < candidates.length - 1;
      if (!canFallback || !isTransientModelError(error)) throw error;
    }
  }

  throw new Error('No research model was available.');
}

async function classifyTask(
  state: typeof ResearchStateAnnotation.State,
): Promise<typeof ResearchStateAnnotation.Update> {
  return {
    route: routeResearchTask(state.query || '', state.taskMode || 'auto'),
  };
}

async function retrieveProjectContext(
  state: typeof ResearchStateAnnotation.State,
  config: RunnableConfig,
): Promise<typeof ResearchStateAnnotation.Update> {
  try {
    const route = state.route || 'qa';
    const retrievalQuery = {
      qa: state.query,
      analysis: `training metrics loss accuracy convergence experiment results ${state.query}`,
      ablation: `model configuration baseline modules hyperparameters experiments ${state.query}`,
    }[route];
    const configurable = {
      ...(config.configurable || {}),
      k: route === 'qa' ? 8 : 12,
      filterKwargs: state.projectId ? { projectId: state.projectId } : {},
    };
    const retriever = await makeRetriever({ ...config, configurable });
    const documents = await retriever.invoke(retrievalQuery);
    return { documents, retrievalError: '' };
  } catch (error) {
    return {
      documents: 'delete',
      retrievalError: error instanceof Error ? error.message : String(error),
    };
  }
}

function selectTaskExecutor(
  state: typeof ResearchStateAnnotation.State,
): 'answerQuestion' | 'analyzeExperiments' | 'planAblation' {
  if (state.route === 'analysis') return 'analyzeExperiments';
  if (state.route === 'ablation') return 'planAblation';
  return 'answerQuestion';
}

function resultTitle(task: ResearchTask): string {
  if (task === 'analysis') return '实验结果分析';
  if (task === 'ablation') return '消融实验方案';
  return '科研资料问答';
}

async function executeTask(
  task: ResearchTask,
  state: typeof ResearchStateAnnotation.State,
  config: RunnableConfig,
): Promise<typeof ResearchStateAnnotation.Update> {
  const sources = buildResearchSources(state.documents || []);
  try {
    const configuration = ensureAgentConfiguration(config);
    const context = formatResearchContext(state.documents || []);
    const prompt = buildResearchPrompt(
      task,
      state.query || '',
      context,
      state.retrievalError,
    );
    const response = await invokeResearchModel(
      configuration.queryModel,
      prompt,
    );
    let markdown = normalizeModelContent(response.content);
    if (!markdown) {
      throw new Error('The model returned an empty research result.');
    }

    let generatedFiles =
      task === 'ablation' ? extractGeneratedFiles(markdown) : [];
    if (task === 'ablation' && generatedFiles.length === 0) {
      const fallback = buildFallbackAblationConfig(
        state.query || 'CV ablation study',
      );
      markdown += `\n\n## 可下载配置\n\n\`\`\`yaml\n${fallback}\n\`\`\``;
      generatedFiles = [
        {
          filename: 'ablation_plan.yaml',
          language: 'yaml',
          content: fallback,
        },
      ];
    }

    const result: ResearchResult = {
      status: 'success',
      task,
      title: resultTitle(task),
      summary: markdown.replace(/[#*`>]/g, '').slice(0, 220),
      markdown,
      sources,
      generatedFiles,
      warning:
        [state.retrievalError, response.warning].filter(Boolean).join(' ') ||
        undefined,
    };
    return { result, documents: 'delete' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      documents: 'delete',
      result: {
        status: 'error',
        task,
        title: resultTitle(task),
        summary: message,
        markdown: `## 任务未完成\n\n${message}\n\n后端已隔离该错误，LangGraph 服务会继续运行。`,
        sources,
        generatedFiles: [],
        warning: state.retrievalError || undefined,
      },
    };
  }
}

const answerQuestion = (
  state: typeof ResearchStateAnnotation.State,
  config: RunnableConfig,
) => executeTask('qa', state, config);

const analyzeExperiments = (
  state: typeof ResearchStateAnnotation.State,
  config: RunnableConfig,
) => executeTask('analysis', state, config);

const planAblation = (
  state: typeof ResearchStateAnnotation.State,
  config: RunnableConfig,
) => executeTask('ablation', state, config);

const builder = new StateGraph(
  ResearchStateAnnotation,
  AgentConfigurationAnnotation,
)
  .addNode('classifyTask', classifyTask)
  .addNode('retrieveProjectContext', retrieveProjectContext)
  .addNode('answerQuestion', answerQuestion)
  .addNode('analyzeExperiments', analyzeExperiments)
  .addNode('planAblation', planAblation)
  .addEdge(START, 'classifyTask')
  .addEdge('classifyTask', 'retrieveProjectContext')
  .addConditionalEdges('retrieveProjectContext', selectTaskExecutor, [
    'answerQuestion',
    'analyzeExperiments',
    'planAblation',
  ])
  .addEdge('answerQuestion', END)
  .addEdge('analyzeExperiments', END)
  .addEdge('planAblation', END);

export const graph = builder.compile().withConfig({
  runName: 'CVResearchWorkflowGraph',
});
