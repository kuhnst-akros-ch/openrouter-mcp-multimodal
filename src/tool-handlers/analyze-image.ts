import path from 'path';
import { promises as fs } from 'fs';
import sharp from 'sharp';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import OpenAI from 'openai';

export interface AnalyzeImageToolRequest {
  image_path: string;
  question?: string;
  model?: string;
}

export async function handleAnalyzeImage(
  request: { params: { arguments: AnalyzeImageToolRequest } },
  openai: OpenAI,
  defaultModel?: string
) {
  const args = request.params.arguments;
  
  try {
    // Validate image path
    const imagePath = args.image_path;
    if (!path.isAbsolute(imagePath)) {
      throw new McpError(ErrorCode.InvalidParams, 'Image path must be absolute');
    }
    
    // Read image file
    const imageBuffer = await fs.readFile(imagePath);
    console.error(`Successfully read image buffer of size: ${imageBuffer.length}`);
    
    // Get image metadata
    const metadata = await sharp(imageBuffer).metadata();
    console.error('Image metadata:', metadata);
    
    // Calculate dimensions to keep base64 size reasonable
    const MAX_DIMENSION = 800; // Larger than original example for better quality
    const JPEG_QUALITY = 80; // Higher quality
    let resizedBuffer = imageBuffer;
    
    if (metadata.width && metadata.height) {
      const largerDimension = Math.max(metadata.width, metadata.height);
      if (largerDimension > MAX_DIMENSION) {
        const resizeOptions = metadata.width > metadata.height
          ? { width: MAX_DIMENSION }
          : { height: MAX_DIMENSION };
        
        resizedBuffer = await sharp(imageBuffer)
          .resize(resizeOptions)
          .jpeg({ quality: JPEG_QUALITY })
          .toBuffer();
      } else {
        resizedBuffer = await sharp(imageBuffer)
          .jpeg({ quality: JPEG_QUALITY })
          .toBuffer();
      }
    }
    
    // Convert to base64
    const base64Image = resizedBuffer.toString('base64');
    
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
