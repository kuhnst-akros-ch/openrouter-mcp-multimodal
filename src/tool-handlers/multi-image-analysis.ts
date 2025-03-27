import fetch from 'node-fetch';
import sharp from 'sharp';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import OpenAI from 'openai';
import path from 'path';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
// Remove uuid import as we'll use a simple random string generator instead
// import { v4 as uuidv4 } from 'uuid';

// Default model for image analysis
const DEFAULT_FREE_MODEL = 'qwen/qwen2.5-vl-32b-instruct:free';

// Image processing constants
const MAX_DIMENSION = 800;
const JPEG_QUALITY = 80;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000; // ms

// Simple random ID generator to replace uuid
function generateRandomId(): string {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

export interface MultiImageAnalysisToolRequest {
  images: Array<{
    url: string;
    alt?: string;
  }>;
  prompt: string;
  markdown_response?: boolean;
  model?: string;
}

/**
 * Sleep function for retry mechanisms
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Get MIME type from file extension or data URL
 */
function getMimeType(url: string): string {
  if (url.startsWith('data:')) {
    const match = url.match(/^data:([^;]+);/);
    return match ? match[1] : 'application/octet-stream';
  }
  
  const extension = path.extname(url.split('?')[0]).toLowerCase();
  
  switch (extension) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.gif': return 'image/gif';
    case '.bmp': return 'image/bmp';
    case '.svg': return 'image/svg+xml';
    default: return 'application/octet-stream';
  }
}

/**
 * Fetch image from various sources: data URLs, file paths, or remote URLs
 */
async function fetchImageAsBuffer(url: string): Promise<Buffer> {
  try {
    // Handle data URLs
    if (url.startsWith('data:')) {
      const matches = url.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        throw new Error('Invalid data URL format');
      }
      return Buffer.from(matches[2], 'base64');
    }
    
    // Handle file URLs with file:// protocol
    if (url.startsWith('file://')) {
      const filePath = url.replace('file://', '');
      try {
        return await fs.readFile(filePath);
      } catch (error) {
        console.error(`Error reading file at ${filePath}:`, error);
        throw new Error(`Failed to read file: ${filePath}`);
      }
    }
    
    // Handle absolute and relative file paths
    if (url.startsWith('/') || url.startsWith('./') || url.startsWith('../') || /^[A-Za-z]:\\/.test(url)) {
      try {
        return await fs.readFile(url);
      } catch (error) {
        console.error(`Error reading file at ${url}:`, error);
        throw new Error(`Failed to read file: ${url}`);
      }
    }
    
    // Handle http/https URLs
    if (url.startsWith('http://') || url.startsWith('https://')) {
      for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
        try {
          // Use AbortController for timeout instead of timeout option
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000);
          
          const response = await fetch(url, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'OpenRouter-MCP-Server/1.0'
            }
          });
          
          // Clear the timeout to prevent memory leaks
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          
          return Buffer.from(await response.arrayBuffer());
        } catch (error) {
          console.error(`Error fetching URL (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS}): ${url}`, error);
          
          if (attempt < MAX_RETRY_ATTEMPTS - 1) {
            // Exponential backoff with jitter
            const delay = RETRY_DELAY * Math.pow(2, attempt) * (0.5 + Math.random() * 0.5);
            await sleep(delay);
          } else {
            throw error;
          }
        }
      }
    }
    
    // If we get here, the URL format is unsupported
    throw new Error(`Unsupported URL format: ${url}`);
  } catch (error) {
    console.error(`Error fetching image from ${url}:`, error);
    throw error;
  }
  
  // TypeScript requires a return statement here, but this is unreachable
  return Buffer.from([]);
}

/**
 * Process and optimize image for API consumption
 */
async function processImage(buffer: Buffer, mimeType: string): Promise<string> {
  try {
    // Create a temporary directory for processing if needed
    const tempDir = path.join(tmpdir(), `openrouter-mcp-${generateRandomId()}`);
    await fs.mkdir(tempDir, { recursive: true });
    
    // Get image info
    let sharpInstance = sharp(buffer);
    const metadata = await sharpInstance.metadata();
    
    // Skip processing for small images
    if (metadata.width && metadata.height && 
        metadata.width <= MAX_DIMENSION && 
        metadata.height <= MAX_DIMENSION &&
        (mimeType === 'image/jpeg' || mimeType === 'image/webp')) {
      return buffer.toString('base64');
    }
    
    // Resize larger images
    if (metadata.width && metadata.height) {
      const largerDimension = Math.max(metadata.width, metadata.height);
      if (largerDimension > MAX_DIMENSION) {
        const resizeOptions = metadata.width > metadata.height
          ? { width: MAX_DIMENSION }
          : { height: MAX_DIMENSION };
        
        sharpInstance = sharpInstance.resize(resizeOptions);
      }
    }
    
    // Convert to JPEG for consistency and small size
    const processedBuffer = await sharpInstance
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
    
    return processedBuffer.toString('base64');
  } catch (error) {
    console.error('Error processing image:', error);
    
    // If sharp processing fails, return the original buffer
    // This is a fallback to ensure we don't completely fail on processing errors
    console.error('Returning original image without processing');
    return buffer.toString('base64');
  }
}

/**
 * Find a suitable free model with vision capabilities, defaulting to Qwen
 */
export async function findSuitableFreeModel(openai: OpenAI): Promise<string> {
  try {
    // First try with an exact match for our preferred model
    const preferredModel = DEFAULT_FREE_MODEL;
    
    try {
      // Check if our preferred model is available 
      const modelInfo = await openai.models.retrieve(preferredModel);
      if (modelInfo && modelInfo.id) {
        console.error(`Using preferred model: ${preferredModel}`);
        return preferredModel;
      }
    } catch (error) {
      console.error(`Preferred model ${preferredModel} not available, searching for alternatives...`);
    }
    
    // Query available models
    const modelsResponse = await openai.models.list();
    if (!modelsResponse?.data || modelsResponse.data.length === 0) {
      console.error('No models found, using default fallback model');
      return DEFAULT_FREE_MODEL;
    }
    
    // First, try to find free vision models
    const freeVisionModels = modelsResponse.data
      .filter(model => {
        const modelId = model.id.toLowerCase();
        return modelId.includes('free') && 
              (modelId.includes('vl') || modelId.includes('vision') || modelId.includes('claude') || 
               modelId.includes('gemini') || modelId.includes('gpt-4') || modelId.includes('qwen'));
      })
      .map(model => {
        // Extract context length if available
        let contextLength = 0;
        try {
          const modelAny = model as any;
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
    
    if (freeVisionModels.length > 0) {
      // Sort by context length and pick the one with the largest context window
      freeVisionModels.sort((a, b) => b.contextLength - a.contextLength);
      const selectedModel = freeVisionModels[0].id;
      console.error(`Selected free vision model: ${selectedModel} with context length: ${freeVisionModels[0].contextLength}`);
      return selectedModel;
    }
    
    // If no free vision models found, fallback to our default
    console.error('No free vision models found, using default fallback model');
    return DEFAULT_FREE_MODEL;
  } catch (error) {
    console.error('Error finding suitable model:', error);
    return DEFAULT_FREE_MODEL;
  }
}

/**
 * Process and analyze multiple images using OpenRouter
 */
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
    
    // Track successful and failed images for reporting
    const successfulImages = [];
    const failedImages = [];
    
    // Process each image
    for (const [index, image] of args.images.entries()) {
      try {
        console.error(`Processing image ${index + 1}/${args.images.length}: ${image.url.substring(0, 50)}...`);
        
        // Get MIME type
        const mimeType = getMimeType(image.url);
        
        // Fetch and process the image
        const imageBuffer = await fetchImageAsBuffer(image.url);
        const base64Image = await processImage(imageBuffer, mimeType);
        
        // Use JPEG as the output format for consistency
        const outputMimeType = 'image/jpeg';
        
        // Add to content
        content.push({
          type: 'image_url',
          image_url: {
            url: `data:${outputMimeType};base64,${base64Image}`
          }
        });
        
        successfulImages.push(image.url);
      } catch (error) {
        console.error(`Error processing image ${index + 1} (${image.url.substring(0, 30)}...):`, error);
        failedImages.push({url: image.url, error: error instanceof Error ? error.message : String(error)});
        // Continue with other images if one fails
      }
    }
    
    // If no images were successfully processed
    if (content.length === 1) {
      const errorDetails = failedImages.map(img => `${img.url.substring(0, 30)}...: ${img.error}`).join('; ');
      throw new Error(`Failed to process any of the provided images. Errors: ${errorDetails}`);
    }
    
    // Select model with priority:
    // 1. User-specified model
    // 2. Default model from environment
    // 3. Default free vision model (qwen/qwen2.5-vl-32b-instruct:free)
    let model = args.model || defaultModel || DEFAULT_FREE_MODEL;
    
    // If a model is specified but not our default free model, verify it exists
    if (model !== DEFAULT_FREE_MODEL) {
      try {
        await openai.models.retrieve(model);
      } catch (error) {
        console.error(`Specified model ${model} not found, falling back to auto-selection`);
        model = await findSuitableFreeModel(openai);
      }
    }
    
    console.error(`Making API call with model: ${model}`);
    console.error(`Successfully processed ${successfulImages.length} images, ${failedImages.length} failed`);
    
    // Make the API call
    const completion = await openai.chat.completions.create({
      model,
      messages: [{
        role: 'user',
        content
      }] as any
    });
    
    // Format the response
    let responseText = completion.choices[0].message.content || '';
    
    // Add information about failed images if any
    if (failedImages.length > 0) {
      const formattedErrors = args.markdown_response !== false
        ? `\n\n---\n\n**Note:** ${failedImages.length} image(s) could not be processed:\n${failedImages.map((img, i) => `- Image ${i+1}: ${img.error}`).join('\n')}`
        : `\n\nNote: ${failedImages.length} image(s) could not be processed: ${failedImages.map((img, i) => `Image ${i+1}: ${img.error}`).join('; ')}`;
      
      responseText += formattedErrors;
    }
    
    // Return the analysis result
    return {
      content: [
        {
          type: 'text',
          text: responseText,
        },
      ],
      metadata: {
        model: completion.model,
        usage: completion.usage,
        successful_images: successfulImages.length,
        failed_images: failedImages.length
      }
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
      metadata: {
        error_type: error instanceof Error ? error.constructor.name : 'Unknown',
        error_message: error instanceof Error ? error.message : String(error)
      }
    };
  }
}
