import 'server-only';
import { ExtractResultField } from '../shared/types';
import { NativePositionalPdfExtractor } from './NativePositionalPdfExtractor.server';
import { NativeLinearPdfExtractor } from './NativeLinearPdfExtractor.server';
import { EarlyStopDetector } from '../shared/EarlyStopDetector';
import { DocumentProcessingLogger } from './DocumentProcessingLogger.server';

export class DocumentParserRegistry {
  
  static parsePositional(tokens: any[]): { fields: Record<string, ExtractResultField>, status: string } {
    if (!tokens || tokens.length === 0) {
      return { fields: {}, status: 'NO_NATIVE_TEXT' };
    }
    
    const fields = NativePositionalPdfExtractor.extractFields(tokens);
    const isSufficient = EarlyStopDetector.isSufficientlyParsed(fields);
    
    if (isSufficient) {
      return { fields, status: 'COMPLETED' };
    }
    return { fields, status: 'NATIVE_TEXT_UNPARSED' };
  }

  static parseLinear(text: string): { fields: Record<string, ExtractResultField>, status: string } {
    if (!text || text.trim().length === 0) {
      return { fields: {}, status: 'NO_NATIVE_TEXT' };
    }

    const fields = NativeLinearPdfExtractor.extractFields(text);
    const isSufficient = EarlyStopDetector.isSufficientlyParsed(fields);

    if (isSufficient) {
      return { fields, status: 'COMPLETED' };
    }
    return { fields, status: 'UNSUPPORTED_DOCUMENT_LAYOUT' };
  }
}
