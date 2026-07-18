import { z } from 'zod';
import {
  createGeminiChatModel,
  createGeminiEmbeddings,
} from '../src/shared/gemini.js';

const model = createGeminiChatModel('gemini-3.5-flash', 0.2);
console.log('chat:start');
const chatResponse = await model.invoke('Reply with the single word OK.');
console.log('chat:ok');

const router = model.withStructuredOutput(
  z.object({ route: z.enum(['direct', 'retrieve']) }),
);
console.log('structured:start');
const structuredResponse = await router.invoke(
  'Classify this as direct: What is two plus two?',
);
console.log('structured:ok');

console.log('embedding:start');
const embedding = await createGeminiEmbeddings().embedQuery(
  'Gemini embedding verification',
);
console.log('embedding:ok');

console.log(
  JSON.stringify({
    chatResponseReceived:
      typeof chatResponse.content === 'string' &&
      chatResponse.content.trim().length > 0,
    structuredRoute: structuredResponse.route,
    embeddingDimensions: embedding.length,
  }),
);
