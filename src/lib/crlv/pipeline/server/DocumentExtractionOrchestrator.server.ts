import 'server-only';
import { DocumentParserRegistry } from './DocumentParserRegistry.server';
import { ProcessingSessionService } from './ProcessingSessionService.server';
import { DocumentExtractionResult, ProcessingSession } from '../shared/types';
import { ErrorCodes } from '../shared/error-codes';
import { DocumentProcessingLogger } from './DocumentProcessingLogger.server';

export class DocumentExtractionOrchestrator {
  
  static async handleClientTextResult(
    session: ProcessingSession,
    pages: any[],
    source: 'client_native_pdf' | 'local_ocr'
  ): Promise<DocumentExtractionResult> {
    try {
      DocumentProcessingLogger.info(`Handling result from ${source} for ${session.processingId}`);
      
      let finalFields = {};
      let finalStatus = 'NO_NATIVE_TEXT';
      
      if (source === 'client_native_pdf') {
        const allTokens = pages.flatMap(p => p.tokens || []);
        if (allTokens.length > 0) {
          const positionalRes = DocumentParserRegistry.parsePositional(allTokens);
          finalFields = positionalRes.fields;
          finalStatus = positionalRes.status;
          
          if (finalStatus !== 'COMPLETED') {
            const allText = pages.map(p => p.text).join('\n');
            const linearRes = DocumentParserRegistry.parseLinear(allText);
            
            // Merge fields, preferring validated ones
            finalFields = this.mergeFields(finalFields, linearRes.fields);
            finalStatus = linearRes.status;
          }
        }
      } else if (source === 'local_ocr') {
        const allText = pages.map(p => p.text).join('\n');
        const linearRes = DocumentParserRegistry.parseLinear(allText);
        finalFields = linearRes.fields;
        finalStatus = linearRes.status;
      }
      
      await ProcessingSessionService.updateStatus(session.processingId, finalStatus, { resultFields: finalFields });
      
      return {
        fields: finalFields,
        status: finalStatus as any,
        message: 'Extraction finalized',
        strategyUsed: source === 'local_ocr' ? 'CLIENT_OCR' : 'CLIENT_PDFJS'
      };
      
    } catch (e: any) {
      DocumentProcessingLogger.error('Error handling client result', e);
      throw e;
    }
  }

  static async handleServerNativeExtraction(session: ProcessingSession, buffer: Buffer): Promise<DocumentExtractionResult> {
    try {
      // 1. Try positional extraction via pdfjs-dist
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, disableFontFace: true });
      const doc = await loadingTask.promise;
      const page = await doc.getPage(1);
      const content = await page.getTextContent();
      
      const tokens = (content.items as any[]).map(item => ({
        text: item.str,
        normalizedText: item.str.trim(),
        page: 1,
        x: Math.round(item.transform[4]),
        y: Math.round(item.transform[5]),
        width: item.width || 0,
        height: item.height || 0,
        fontSize: null,
        direction: null
      })).filter(t => t.normalizedText.length > 0);

      const posResult = DocumentParserRegistry.parsePositional(tokens);
      if (posResult.status === 'COMPLETED') {
        await ProcessingSessionService.updateStatus(session.processingId, 'COMPLETED', { resultFields: posResult.fields });
        return { fields: posResult.fields, status: 'COMPLETED', message: 'Success', strategyUsed: 'NATIVE_POSITIONAL' };
      }

      // 2. Try linear fallback via pdf-parse
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const textResult = await parser.getText();
      
      const linResult = DocumentParserRegistry.parseLinear(textResult.text);
      
      // Merge
      const mergedFields = this.mergeFields(posResult.fields, linResult.fields);
      await ProcessingSessionService.updateStatus(session.processingId, linResult.status, { resultFields: mergedFields });

      return { fields: mergedFields, status: linResult.status as any, message: 'Extracted', strategyUsed: 'NATIVE_LINEAR' };

    } catch (e: any) {
      DocumentProcessingLogger.error('Server extraction error', e);
      throw new Error(ErrorCodes.CORRUPTED_PDF);
    }
  }

  private static mergeFields(f1: any, f2: any) {
    const res = { ...f1 };
    for (const [k, v] of Object.entries(f2) as any[]) {
      if (!res[k]?.validatedValue && v.validatedValue) {
        res[k] = v;
      }
    }
    return res;
  }
}
