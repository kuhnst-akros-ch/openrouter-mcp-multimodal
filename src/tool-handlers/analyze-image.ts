import path from 'path';
import { promises as fs } from 'fs';
import sharp from 'sharp';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import OpenAI from 'openai';
import fetch from 'node-fetch';

export interface AnalyzeImageToolRequest {
  image_path?: string;
  image_url?: string;
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

export async function handleAnalyzeImage(
  request: { params: { arguments: AnalyzeImageToolRequest } },
  openai: OpenAI,
  defaultModel?: string
) {
  const args = request.params.arguments;
  
  try {
    // Validate image source
    const imagePath = args.image_path;
    const imageUrl = args.image_url;
    
    if (!imagePath && !imageUrl) {
      throw new McpError(ErrorCode.InvalidParams, 'Either image_path or image_url must be provided');
    }
    
    // Normalize the path/url
    let imageSource: string;
    
    if (imageUrl) {
      // Use the provided URL directly
      imageSource = imageUrl;
    } else if (imagePath) {
      // For backward compatibility, try to handle the image_path
      if (path.isAbsolute(imagePath)) {
        // For absolute paths, use as a local file path
        imageSource = imagePath;
      } else {
        // For relative paths, show a better error message
        throw new McpError(ErrorCode.InvalidParams, 'Image path must be absolute or use image_url with file:// prefix');
      }
    } else {
      // This shouldn't happen due to the check above, but TypeScript doesn't know that
      throw new McpError(ErrorCode.InvalidParams, 'No image source provided');
    }
    
    // Fetch and process the image
    const imageBuffer = await fetchImageAsBuffer(imageSource);
    console.error(`Successfully read image buffer of size: ${imageBuffer.length}`);
    
    // Process the image (resize if needed)
    const base64Image = await processImage(imageBuffer);
    
    // Select model
    const model = args.model || defaultModel || 'anthropic/claude-3.5-sonnet';
    
    // Prepare message with image
    const messages = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: args.question || "What's in this image?"
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${base64Image}`
            }
          }
        ]
      }
    ];
    
    console.error('Sending request to OpenRouter...');
    
    // Call OpenRouter API
    const completion = await openai.chat.completions.create({
      model,
      messages: messages as any,
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
    console.error('Error analyzing image:', error);
    
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
    };
  }
}
