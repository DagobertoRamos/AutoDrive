import 'server-only';
import { PositionedPdfToken, ExtractResultField } from '../shared/types';
import { DocumentFieldNormalizer } from '../shared/DocumentFieldNormalizer';
import { DocumentFieldValidator } from '../shared/DocumentFieldValidator';

export class NativePositionalPdfExtractor {
  
  static extractFields(tokens: PositionedPdfToken[]): Record<string, ExtractResultField> {
    const fields: Record<string, { rawValue: string } | null> = {};
    
    // 1. Group tokens by Y coordinate adaptively
    // We sort tokens by Y, then group those within a small threshold (e.g., 3-5px depending on height)
    tokens.sort((a, b) => a.y - b.y);
    const lines: PositionedPdfToken[][] = [];
    let currentLine: PositionedPdfToken[] = [];
    
    for (const token of tokens) {
      if (currentLine.length === 0) {
        currentLine.push(token);
        continue;
      }
      
      const lastToken = currentLine[currentLine.length - 1];
      const yDiff = Math.abs(token.y - lastToken.y);
      const threshold = Math.max(3, (token.height || 10) * 0.3); // Adaptive threshold
      
      if (yDiff <= threshold) {
        currentLine.push(token);
      } else {
        lines.push([...currentLine]);
        currentLine = [token];
      }
    }
    if (currentLine.length > 0) lines.push(currentLine);
    
    // Sort each line by X coordinate
    lines.forEach(line => line.sort((a, b) => a.x - b.x));
    
    // Flatten back to lines string for regex parsing or geometric parsing
    const parsedText = lines.map(line => line.map(t => t.text).join(' | ')).join('\n');
    
    // Extraction rules
    fields['placa'] = this.extractRegex(parsedText, /PLACA.*?\|\s*([A-Z0-9]{7})|PLACA\n([A-Z0-9]{7})/);
    fields['renavam'] = this.extractRegex(parsedText, /CÓDIGO RENAVAM.*?\|\s*([\d]{9,11})|CÓDIGO RENAVAM\n([\d]{9,11})/);
    fields['chassi'] = this.extractRegex(parsedText, /CHASSI.*?\n.*?\|\s*([A-Z0-9]{17})/);
    fields['anoFabricacao'] = this.extractRegex(parsedText, /ANO FABRICAÇÃO.*?\n([\d]{4})/);
    fields['anoModelo'] = this.extractRegex(parsedText, /ANO MODELO.*?\|\s*([\d]{4})/);
    
    const result: Record<string, ExtractResultField> = {};
    for (const [key, rawValue] of Object.entries(fields)) {
      if (!rawValue) continue;
      let norm = rawValue.rawValue;
      let valid = false;
      
      if (key === 'placa') { norm = DocumentFieldNormalizer.normalizePlate(rawValue.rawValue) || ''; valid = DocumentFieldValidator.validatePlate(norm); }
      if (key === 'renavam') { norm = DocumentFieldNormalizer.normalizeRenavam(rawValue.rawValue) || ''; valid = DocumentFieldValidator.validateRenavam(norm); }
      if (key === 'chassi') { norm = DocumentFieldNormalizer.normalizeChassis(rawValue.rawValue) || ''; valid = DocumentFieldValidator.validateChassis(norm); }
      if (key === 'anoFabricacao' || key === 'anoModelo') { norm = DocumentFieldNormalizer.normalizeYear(rawValue.rawValue) || ''; valid = DocumentFieldValidator.validateYear(norm); }
      
      result[key] = {
        rawValue: rawValue.rawValue,
        normalizedValue: norm,
        validatedValue: valid ? norm : null,
        confidence: valid ? 0.95 : 0.5,
        sourcePage: 1,
        extractionMethod: 'NATIVE_POSITIONAL',
        needsReview: !valid,
        warnings: valid ? [] : ['Value failed validation']
      };
    }
    
    return result;
  }

  private static extractRegex(text: string, regex: RegExp): { rawValue: string } | null {
    const match = text.match(regex);
    if (match) {
      return { rawValue: match[1] || match[2] || match[0] };
    }
    return null;
  }
}
