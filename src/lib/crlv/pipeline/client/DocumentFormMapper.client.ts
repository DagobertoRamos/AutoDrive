'use client';
import { ExtractResultField } from '../shared/types';

export class DocumentFormMapper {
  static mapToForm(fields: Record<string, ExtractResultField>, formSetValue: (name: string, val: string) => void) {
    if (!fields) return;

    for (const [key, fieldData] of Object.entries(fields)) {
      if (fieldData.validatedValue) {
        formSetValue(key, fieldData.validatedValue);
      } else if (fieldData.normalizedValue) {
        // Can optionally set with a warning
        formSetValue(key, fieldData.normalizedValue);
      }
    }
  }
}
