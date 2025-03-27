# OpenRouter MCP Multimodal Server

[![Build Status](https://github.com/stabgan/openrouter-mcp-multimodal/actions/workflows/publish.yml/badge.svg)](https://github.com/stabgan/openrouter-mcp-multimodal/actions/workflows/publish.yml)
[![npm version](https://img.shields.io/npm/v/@stabgan/openrouter-mcp-multimodal.svg)](https://www.npmjs.com/package/@stabgan/openrouter-mcp-multimodal)
[![Docker Pulls](https://img.shields.io/docker/pulls/stabgandocker/openrouter-mcp-multimodal.svg)](https://hub.docker.com/r/stabgandocker/openrouter-mcp-multimodal)

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

### Option 1: Install via npm

```bash
npm install -g @stabgan/openrouter-mcp-multimodal
```

### Option 2: Run via Docker

```bash
docker run -i -e OPENROUTER_API_KEY=your-api-key-here stabgandocker/openrouter-mcp-multimodal:latest
```

## Quick Start Configuration

### Prerequisites

1. Get your OpenRouter API key from [OpenRouter Keys](https://openrouter.ai/keys)
2. Choose a default model (optional)

### MCP Configuration Options

Add one of the following configurations to your MCP settings file (e.g., `cline_mcp_settings.json` or `claude_desktop_config.json`):

#### Option 1: Using npx (Node.js)

```json
{
  "mcpServers": {
    "openrouter": {
      "command": "npx",
      "args": [
        "-y",
        "@stabgan/openrouter-mcp-multimodal"
      ],
      "env": {
        "OPENROUTER_API_KEY": "your-api-key-here",
        "OPENROUTER_DEFAULT_MODEL": "anthropic/claude-3.5-sonnet"
      }
    }
  }
}
```

#### Option 2: Using uv (Python Package Manager)

```json
{
  "mcpServers": {
    "openrouter": {
      "command": "uv",
      "args": [
        "run",
        "-m",
        "openrouter_mcp_multimodal"
      ],
      "env": {
        "OPENROUTER_API_KEY": "your-api-key-here",
        "OPENROUTER_DEFAULT_MODEL": "anthropic/claude-3.5-sonnet"
      }
    }
  }
}
```

#### Option 3: Using Docker

```json
{
  "mcpServers": {
    "openrouter": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "-e", "OPENROUTER_API_KEY=your-api-key-here",
        "-e", "OPENROUTER_DEFAULT_MODEL=anthropic/claude-3.5-sonnet",
        "stabgandocker/openrouter-mcp-multimodal:latest"
      ]
    }
  }
}
```

#### Option 4: Using Smithery (recommended)

```json
{
  "mcpServers": {
    "openrouter": {
      "command": "smithery",
      "args": [
        "run",
        "stabgan/openrouter-mcp-multimodal"
      ],
      "env": {
        "OPENROUTER_API_KEY": "your-api-key-here",
        "OPENROUTER_DEFAULT_MODEL": "anthropic/claude-3.5-sonnet"
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
  server_name: "openrouter",
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
  server_name: "openrouter",
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

### multi_image_analysis

Analyze multiple images with a single prompt:

```javascript
use_mcp_tool({
  server_name: "openrouter",
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
  server_name: "openrouter",
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
  server_name: "openrouter",
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
  server_name: "openrouter",
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

## Troubleshooting

### Common Issues

- **"fetch is not defined" error**: This often occurs when the Node.js environment doesn't have global fetch. Use Node.js v18+ or add the PATH environment variable to your configuration as shown below:

```json
{
  "mcpServers": {
    "openrouter": {
      "command": "npx",
      "args": [
        "-y",
        "@stabgan/openrouter-mcp-multimodal"
      ],
      "env": {
        "OPENROUTER_API_KEY": "your-api-key-here",
        "PATH": "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
      }
    }
  }
}
```

- **Image analysis failures**: Make sure your image path is absolute and the file format is supported.

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

## Version 1.2.0 Updates
- Simplified image analysis by consolidating all functionality into the `multi_image_analysis` tool
- Added automatic selection of free models with the largest context window when no model is specified
- Improved handling of various image formats (file://, http://, data:)
- Enhanced error handling and logging for better troubleshooting
- Removed the `analyze_image` tool to eliminate confusion and streamline the interface
