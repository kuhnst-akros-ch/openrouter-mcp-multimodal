import path from 'path';
import { promises as fs } from 'fs';
import sharp from 'sharp';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import OpenAI from 'openai';
import fetch from 'node-fetch';
import { findSuitableFreeModel } from './multi-image-analysis.js';

// Default model for image analysis
const DEFAULT_FREE_MODEL = 'qwen/qwen2.5-vl-32b-instruct:free';

export interface AnalyzeImageToolRequest {
  image_path: string;
  question?: string;
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
      return await fs.readFile(filePath);
    }
    
    // Handle http/https URLs
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return Buffer.from(await response.arrayBuffer());
    }
    
    // Handle regular file paths
    return await fs.readFile(url);
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

/**
 * Converts the image at the given path to a base64 string
 */
async function imageToBase64(imagePath: string): Promise<{ base64: string; mimeType: string }> {
  try {
    // Ensure the image path is absolute
    if (!path.isAbsolute(imagePath)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Image path must be absolute'
      );
    }

    // Check if the file exists
    try {
      await fs.access(imagePath);
    } catch (error) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `File not found: ${imagePath}`
      );
    }

    // Read the file as a buffer
    const buffer = await fs.readFile(imagePath);
    
    // Determine MIME type from file extension
    const extension = path.extname(imagePath).toLowerCase();
    let mimeType: string;
    
    switch (extension) {
      case '.png':
        mimeType = 'image/png';
        break;
      case '.jpg':
      case '.jpeg':
        mimeType = 'image/jpeg';
        break;
      case '.webp':
        mimeType = 'image/webp';
        break;
      case '.gif':
        mimeType = 'image/gif';
        break;
      case '.bmp':
        mimeType = 'image/bmp';
        break;
      default:
        mimeType = 'application/octet-stream';
    }
    
    // Convert buffer to base64
    const base64 = buffer.toString('base64');
    
    return { base64, mimeType };
  } catch (error) {
    console.error('Error converting image to base64:', error);
    throw error;
  }
}

/**
 * Handler for analyzing a single image
 */
export async function handleAnalyzeImage(
  request: { params: { arguments: AnalyzeImageToolRequest } },
  openai: OpenAI,
  defaultModel?: string
) {
  const args = request.params.arguments;
  
  try {
    // Validate inputs
    if (!args.image_path) {
      throw new McpError(ErrorCode.InvalidParams, 'An image path is required');
    }
    
    if (!args.question) {
      throw new McpError(ErrorCode.InvalidParams, 'A question about the image is required');
    }
    
    console.error(`Processing image: ${args.image_path}`);
    
    // Convert the image to base64
    const { base64, mimeType } = await imageToBase64(args.image_path);
    
    // Create the content array for the OpenAI API
    const content = [
      {
        type: 'text',
        text: args.question
      },
      {
        type: 'image_url',
        image_url: {
          url: `data:${mimeType};base64,${base64}`
        }
      }
    ];
    
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
    
    // Make the API call
    const completion = await openai.chat.completions.create({
      model,
      messages: [{
        role: 'user',
        content
      }] as any
    });
    
    // Return the analysis result
    return {
      content: [
        {
          type: 'text',
          text: completion.choices[0].message.content || '',
        },
      ],
      metadata: {
        model: completion.model,
        usage: completion.usage
      }
    };
  } catch (error) {
    console.error('Error in image analysis:', error);
    
    if (error instanceof McpError) {
      throw error;
    }
    
    return {
      content: [
        {
          type: 'text',
          text: `Error analyzing image: ${error instanceof Error ? error.message : String(error)}`,
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
