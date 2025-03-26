import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions.js';

// Maximum context tokens
const MAX_CONTEXT_TOKENS = 200000;

export interface ChatCompletionToolRequest {
  model?: string;
  messages: ChatCompletionMessageParam[];
  temperature?: number;
}

// Utility function to estimate token count (simplified)
function estimateTokenCount(text: string): number {
  // Rough approximation: 4 characters per token
  return Math.ceil(text.length / 4);
}

// Truncate messages to fit within the context window
function truncateMessagesToFit(
  messages: ChatCompletionMessageParam[], 
  maxTokens: number
): ChatCompletionMessageParam[] {
  const truncated: ChatCompletionMessageParam[] = [];
  let currentTokenCount = 0;

  // Always include system message first if present
  if (messages[0]?.role === 'system') {
    truncated.push(messages[0]);
    currentTokenCount += estimateTokenCount(messages[0].content as string);
  }

  // Add messages from the end, respecting the token limit
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    
    // Skip if it's the system message we've already added
    if (i === 0 && message.role === 'system') continue;
    
    // For string content, estimate tokens directly
    if (typeof message.content === 'string') {
      const messageTokens = estimateTokenCount(message.content);
      if (currentTokenCount + messageTokens > maxTokens) break;
      truncated.unshift(message);
      currentTokenCount += messageTokens;
    } 
    // For multimodal content (array), estimate tokens for text content
    else if (Array.isArray(message.content)) {
      let messageTokens = 0;
      for (const part of message.content) {
        if (part.type === 'text' && part.text) {
          messageTokens += estimateTokenCount(part.text);
        } else if (part.type === 'image_url') {
          // Add a token cost estimate for images - this is a simplification
          // Actual image token costs depend on resolution and model
          messageTokens += 1000; 
        }
      }
      
      if (currentTokenCount + messageTokens > maxTokens) break;
      truncated.unshift(message);
      currentTokenCount += messageTokens;
    }
  }

  return truncated;
}

export async function handleChatCompletion(
  request: { params: { arguments: ChatCompletionToolRequest } },
  openai: OpenAI,
  defaultModel?: string
) {
  const args = request.params.arguments;
  
  // Validate model selection
  const model = args.model || defaultModel;
  if (!model) {
    return {
      content: [
        {
          type: 'text',
          text: 'No model specified and no default model configured in MCP settings. Please specify a model or set OPENROUTER_DEFAULT_MODEL in the MCP configuration.',
        },
      ],
      isError: true,
    };
  }

  // Validate message array
  if (args.messages.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: 'Messages array cannot be empty. At least one message is required.',
        },
      ],
      isError: true,
    };
  }

  try {
    // Truncate messages to fit within context window
    const truncatedMessages = truncateMessagesToFit(args.messages, MAX_CONTEXT_TOKENS);

    const completion = await openai.chat.completions.create({
      model,
      messages: truncatedMessages,
      temperature: args.temperature ?? 1,
    });

    return {
      content: [
        {
          type: 'text',
          text: completion.choices[0].message.content || '',
        },
      ],
    };
  } catch (error) {
    if (error instanceof Error) {
      return {
        content: [
          {
            type: 'text',
            text: `OpenRouter API error: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
    throw error;
  }
}
