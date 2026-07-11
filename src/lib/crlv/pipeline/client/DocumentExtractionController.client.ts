'use client';

import { ClientNativePdfExtractor } from './ClientNativePdfExtractor.client';
import { LocalOcrProvider } from './LocalOcrProvider.client';
import { ScannedPdfRenderer } from './ScannedPdfRenderer.client';

export class DocumentExtractionController {
  
  static async processClientSide(
    file: File, 
    sessionInfo: any
  ): Promise<{ source: 'client_native_pdf' | 'local_ocr', pages: any[] }> {
    
    // If it's a PDF, we try to extract text first.
    if (file.type === 'application/pdf') {
      const pdfjsResult = await ClientNativePdfExtractor.extractTokens(file);
      
      const hasMeaningfulText = pdfjsResult.pages.some(p => p.tokens && p.tokens.length > 5);
      
      if (hasMeaningfulText) {
        // Native text exists, return it to server for parsing. DO NOT USE OCR.
        return {
          source: 'client_native_pdf',
          pages: pdfjsResult.pages
        };
      } else {
        // Scanned PDF. Render to images, then OCR.
        const images = await ScannedPdfRenderer.renderToImages(file);
        const ocrPages = await LocalOcrProvider.extractFromImages(images);
        return {
          source: 'local_ocr',
          pages: ocrPages
        };
      }
    } 
    
    // If it's an image, OCR it directly
    if (file.type.startsWith('image/')) {
      const ocrPages = await LocalOcrProvider.extractFromImages([URL.createObjectURL(file)]);
      return {
        source: 'local_ocr',
        pages: ocrPages
      };
    }
    
    throw new Error('Unsupported file type for client processing');
  }
}
