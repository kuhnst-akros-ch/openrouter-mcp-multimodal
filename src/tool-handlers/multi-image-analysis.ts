import fetch from 'node-fetch';
import sharp from 'sharp';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import OpenAI from 'openai';

export interface MultiImageAnalysisToolRequest {
  images: Array<{
    url: string;
    alt?: string;
  }>;
  prompt: string;
  markdown_response?: boolean;
  model?: string;
}

async function fetchImageAsBuffer(url: string): Promise<Buffer> {
  try {
    // Handle data URLs
    if (url.startsWith('data:')) {
      const matches = url.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        throw new Error('Invalid data URL');
      }
      return Buffer.from(matches[2], 'base64');
    }
    
    // Handle file URLs
    if (url.startsWith('file://')) {
      const filePath = url.replace('file://', '');
      const fs = await import('fs/promises');
      return await fs.readFile(filePath);
    }
    
    // Handle http/https URLs
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    console.error(`Error fetching image from ${url}:`, error);
    throw error;
  }
}

async function processImage(buffer: Buffer): Promise<string> {
  try {
    // Get image metadata
    const metadata = await sharp(buffer).metadata();
    
    // Calculate dimensions to keep base64 size reasonable
    const MAX_DIMENSION = 800;
    const JPEG_QUALITY = 80; 
    
    if (metadata.width && metadata.height) {
      const largerDimension = Math.max(metadata.width, metadata.height);
      if (largerDimension > MAX_DIMENSION) {
        const resizeOptions = metadata.width > metadata.height
          ? { width: MAX_DIMENSION }
          : { height: MAX_DIMENSION };
        
        const resizedBuffer = await sharp(buffer)
          .resize(resizeOptions)
          .jpeg({ quality: JPEG_QUALITY })
          .toBuffer();
        
        return resizedBuffer.toString('base64');
      }
    }
    
    // If no resizing needed, just convert to JPEG
    const jpegBuffer = await sharp(buffer)
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
    
    return jpegBuffer.toString('base64');
  } catch (error) {
    console.error('Error processing image:', error);
    throw error;
  }
}

// Find a suitable free model with vision capabilities
async function findSuitableFreeModel(openai: OpenAI): Promise<string> {
  try {
    // Query available models with 'free' in their name
    const modelsResponse = await openai.models.list();
    if (!modelsResponse || !modelsResponse.data || modelsResponse.data.length === 0) {
      return 'qwen/qwen2.5-vl-32b-instruct:free'; // Fallback to a known model
    }
    
    // Filter models with 'free' in ID and multimodal capabilities
    const freeModels = modelsResponse.data
      .filter(model => model.id.includes('free'))
      .map(model => {
        // Try to extract context length from the model object
        let contextLength = 0;
        try {
          const modelAny = model as any; // Cast to any to access non-standard properties
          if (typeof modelAny.context_length === 'number') {
            contextLength = modelAny.context_length;
          } else if (modelAny.context_window) {
            contextLength = parseInt(modelAny.context_window, 10);
          }
        } catch (e) {
          console.error(`Error parsing context length for model ${model.id}:`, e);
        }
        
        return {
          id: model.id,
          contextLength: contextLength || 0
        };
      });
    
    if (freeModels.length === 0) {
      return 'qwen/qwen2.5-vl-32b-instruct:free'; // Fallback if no free models found
    }
    
    // Sort by context length and pick the one with the largest context window
    freeModels.sort((a, b) => b.contextLength - a.contextLength);
    console.error(`Selected free model: ${freeModels[0].id} with context length: ${freeModels[0].contextLength}`);
    
    return freeModels[0].id;
  } catch (error) {
    console.error('Error finding suitable free model:', error);
    return 'qwen/qwen2.5-vl-32b-instruct:free'; // Fallback to a known model
  }
}

export async function handleMultiImageAnalysis(
  request: { params: { arguments: MultiImageAnalysisToolRequest } },
  openai: OpenAI,
  defaultModel?: string
) {
  const args = request.params.arguments;
  
  try {
    // Validate inputs
    if (!args.images || args.images.length === 0) {
      throw new McpError(ErrorCode.InvalidParams, 'At least one image is required');
    }
    
    if (!args.prompt) {
      throw new McpError(ErrorCode.InvalidParams, 'A prompt is required');
    }
    
    // Prepare content array for the message
    const content: Array<any> = [{
      type: 'text',
      text: args.prompt
    }];
    
    // Process each image
    for (const image of args.images) {
      try {
        // Fetch and process the image
        const imageBuffer = await fetchImageAsBuffer(image.url);
        const base64Image = await processImage(imageBuffer);
        
        // Add to content
        content.push({
          type: 'image_url',
          image_url: {
            url: `data:image/jpeg;base64,${base64Image}`
          }
        });
      } catch (error) {
        console.error(`Error processing image ${image.url}:`, error);
        // Continue with other images if one fails
      }
    }
    
    // If no images were successfully processed
    if (content.length === 1) {
      throw new Error('Failed to process any of the provided images');
    }
    
    // Select model with priority:
    // 1. User-specified model
    // 2. Default model from environment
    // 3. Free model with vision capabilities (selected automatically)
    let model = args.model || defaultModel;
    
    if (!model) {
      model = await findSuitableFreeModel(openai);
      console.error(`Using auto-selected model: ${model}`);
    }
    
    console.error(`Making API call with model: ${model}`);
    
    // Make the API call
    const completion = await openai.chat.completions.create({
      model,
      messages: [{
        role: 'user',
        content
      }] as any
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
    console.error('Error in multi-image analysis:', error);
    
    if (error instanceof McpError) {
      throw error;
    }
    
    return {
      content: [
        {
          type: 'text',
          text: `Error analyzing images: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
