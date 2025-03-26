# OpenRouter MCP Multimodal Server

An MCP (Model Context Protocol) server that provides chat and image analysis capabilities through OpenRouter.ai's diverse model ecosystem. This server combines text chat functionality with powerful image analysis capabilities.

## Features

- **Text Chat:**
  - Direct access to all OpenRouter.ai chat models
  - Support for simple text and multimodal conversations
  - Configurable temperature and other parameters

- **Image Analysis:**
  - Analyze single images with custom questions
  - Process multiple images simultaneously 
  - Automatic image resizing and optimization
  - Support for various image sources (local files, URLs, data URLs)

- **Model Selection:**
  - Search and filter available models
  - Validate model IDs
  - Get detailed model information
  - Support for default model configuration

- **Performance Optimization:**
  - Smart model information caching
  - Exponential backoff for retries
  - Automatic rate limit handling

## Installation

```bash
npm install @stabgan/openrouter-mcp-multimodal
```

## Configuration

### Prerequisites

1. Get your OpenRouter API key from [OpenRouter Keys](https://openrouter.ai/keys)
2. Choose a default model (optional)

### Setup

Add the server to your MCP settings file (e.g., `cline_mcp_settings.json` or `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "openrouter_multimodal": {
      "command": "npx",
      "args": ["@stabgan/openrouter-mcp-multimodal"],
      "env": {
        "OPENROUTER_API_KEY": "your-api-key-here",
        "OPENROUTER_DEFAULT_MODEL": "optional-default-model"
      }
    }
  }
}
```

## Available Tools

### chat_completion

Send text or multimodal messages to OpenRouter models:

```javascript
use_mcp_tool({
  server_name: "openrouter_multimodal",
  tool_name: "chat_completion",
  arguments: {
    model: "google/gemini-2.5-pro-exp-03-25:free", // Optional if default is set
    messages: [
      {
        role: "system",
        content: "You are a helpful assistant."
      },
      {
        role: "user",
        content: "What is the capital of France?"
      }
    ],
    temperature: 0.7 // Optional, defaults to 1.0
  }
});
```

For multimodal messages with images:

```javascript
use_mcp_tool({
  server_name: "openrouter_multimodal",
  tool_name: "chat_completion",
  arguments: {
    model: "anthropic/claude-3.5-sonnet",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "What's in this image?"
          },
          {
            type: "image_url",
            image_url: {
              url: "https://example.com/image.jpg"
            }
          }
        ]
      }
    ]
  }
});
```

### analyze_image

Analyze a single image with an optional question:

```javascript
use_mcp_tool({
  server_name: "openrouter_multimodal",
  tool_name: "analyze_image",
  arguments: {
    image_path: "/absolute/path/to/image.jpg",
    question: "What objects are in this image?", // Optional
    model: "anthropic/claude-3.5-sonnet" // Optional if default is set
  }
});
```

### multi_image_analysis

Analyze multiple images with a single prompt:

```javascript
use_mcp_tool({
  server_name: "openrouter_multimodal",
  tool_name: "multi_image_analysis",
  arguments: {
    images: [
      { url: "https://example.com/image1.jpg" },
      { url: "file:///absolute/path/to/image2.jpg" },
      { 
        url: "https://example.com/image3.jpg",
        alt: "Optional description of image 3" 
      }
    ],
    prompt: "Compare these images and tell me their similarities and differences",
    markdown_response: true, // Optional, defaults to true
    model: "anthropic/claude-3-opus" // Optional if default is set
  }
});
```

### search_models

Search and filter available models:

```javascript
use_mcp_tool({
  server_name: "openrouter_multimodal",
  tool_name: "search_models",
  arguments: {
    query: "claude", // Optional text search
    provider: "anthropic", // Optional provider filter
    capabilities: {
      vision: true // Filter for models with vision capabilities
    },
    limit: 5 // Optional, defaults to 10
  }
});
```

### get_model_info

Get detailed information about a specific model:

```javascript
use_mcp_tool({
  server_name: "openrouter_multimodal",
  tool_name: "get_model_info",
  arguments: {
    model: "anthropic/claude-3.5-sonnet"
  }
});
```

### validate_model

Check if a model ID is valid:

```javascript
use_mcp_tool({
  server_name: "openrouter_multimodal",
  tool_name: "validate_model",
  arguments: {
    model: "google/gemini-2.5-pro-exp-03-25:free"
  }
});
```

## Error Handling

The server provides detailed error messages for various failure cases:

- Invalid input parameters
- Network errors
- Rate limiting issues
- Invalid image formats
- Authentication problems

## Development

To build from source:

```bash
git clone https://github.com/stabgan/openrouter-mcp-multimodal.git
cd openrouter-mcp-multimodal
npm install
npm run build
```

## License

MIT License