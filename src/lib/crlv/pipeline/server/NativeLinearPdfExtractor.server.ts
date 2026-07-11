import 'server-only';
import { ExtractResultField } from '../shared/types';
import { DocumentFieldNormalizer } from '../shared/DocumentFieldNormalizer';
import { DocumentFieldValidator } from '../shared/DocumentFieldValidator';

export class NativeLinearPdfExtractor {
  
  static extractFields(text: string): Record<string, ExtractResultField> {
    const fields: Record<string, { rawValue: string } | null> = {};
    
    // Linear parsing (fallback for simple layout or when positional fails)
    fields['placa'] = this.extractRegex(text, /PLACA\s+([A-Z0-9]{7})/);
    fields['renavam'] = this.extractRegex(text, /RENAVAM\s+([\d]{9,11})/);
    fields['chassi'] = this.extractRegex(text, /CHASSI\s+([A-Z0-9]{17})/);
    
    const result: Record<string, ExtractResultField> = {};
    for (const [key, rawValue] of Object.entries(fields)) {
      if (!rawValue) continue;
      let norm = rawValue.rawValue;
      let valid = false;
      
      if (key === 'placa') { norm = DocumentFieldNormalizer.normalizePlate(rawValue.rawValue) || ''; valid = DocumentFieldValidator.validatePlate(norm); }
      if (key === 'renavam') { norm = DocumentFieldNormalizer.normalizeRenavam(rawValue.rawValue) || ''; valid = DocumentFieldValidator.validateRenavam(norm); }
      if (key === 'chassi') { norm = DocumentFieldNormalizer.normalizeChassis(rawValue.rawValue) || ''; valid = DocumentFieldValidator.validateChassis(norm); }
      
      result[key] = {
        rawValue: rawValue.rawValue,
        normalizedValue: norm,
        validatedValue: valid ? norm : null,
        confidence: valid ? 0.7 : 0.4, // lower confidence for linear
        sourcePage: 1,
        extractionMethod: 'NATIVE_LINEAR',
        needsReview: !valid,
        warnings: valid ? [] : ['Linear extraction unvalidated']
      };
    }
    
    return result;
  }

  private static extractRegex(text: string, regex: RegExp): { rawValue: string } | null {
    const match = text.match(regex);
    if (match) {
      return { rawValue: match[1] };
    }
    return null;
  }
}
