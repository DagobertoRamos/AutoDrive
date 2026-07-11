import { ExtractResultField } from './types';

export class EarlyStopDetector {
  /**
   * Returns true if enough critical fields are found and validated
   * so we can skip OCR or further processing.
   */
  static isSufficientlyParsed(fields: Record<string, ExtractResultField>): boolean {
    const criticalKeys = ['placa', 'renavam', 'chassi', 'anoFabricacao', 'anoModelo'];
    
    let validCount = 0;
    for (const key of criticalKeys) {
      if (fields[key] && fields[key].validatedValue) {
        validCount++;
      }
    }
    
    // If at least 3 critical fields are successfully extracted and validated, it's enough.
    return validCount >= 3;
  }
}
