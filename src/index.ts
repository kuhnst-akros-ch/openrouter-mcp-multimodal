#!/usr/bin/env node
// OpenRouter Multimodal MCP Server
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { ToolHandlers } from './tool-handlers.js';

// Define the default model to use when none is specified
const DEFAULT_MODEL = 'qwen/qwen2.5-vl-32b-instruct:free';

class OpenRouterMultimodalServer {
  private server: Server;
  private toolHandlers!: ToolHandlers; // Using definite assignment assertion

  constructor() {
    // Retrieve API key and default model from environment variables
    const apiKey = process.env.OPENROUTER_API_KEY;
    const defaultModel = process.env.DEFAULT_MODEL || DEFAULT_MODEL;

    // Check if API key is provided
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is required');
    }

    // Initialize the server
    this.server = new Server(
      {
        name: 'openrouter-multimodal-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    
    // Set up error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    
    // Initialize tool handlers
    this.toolHandlers = new ToolHandlers(
      this.server,
      apiKey,
      defaultModel
    );
    
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('OpenRouter Multimodal MCP server running on stdio');
    console.error('Using API key from environment variable');
    console.error('Note: To use OpenRouter Multimodal, add the API key to your environment variables:');
    console.error('      OPENROUTER_API_KEY=your-api-key');
    
    const modelDisplay = process.env.OPENROUTER_DEFAULT_MODEL || DEFAULT_MODEL;
    console.error(`      Using default model: ${modelDisplay}`);
    console.error('Server is ready to process tool calls. Waiting for input...');
  }
}

const server = new OpenRouterMultimodalServer();
server.run().catch(console.error); 
