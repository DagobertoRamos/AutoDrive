export type ExtractionStrategy = 'NATIVE_POSITIONAL' | 'NATIVE_LINEAR' | 'CLIENT_PDFJS' | 'CLIENT_OCR' | 'HYBRID';
export type ProcessingStatus = 'INIT' | 'UPLOADING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface PositionedPdfToken {
  text: string;
  normalizedText: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number | null;
  direction: string | null;
}

export interface ProcessingSession {
  processingId: string;
  processingToken?: string;
  userId: string;
  tenantId: string;
  fileHash: string;
  fileSize: number;
  mimeType: string;
  strategy: ExtractionStrategy;
  status: ProcessingStatus;
  expiresAt: Date;
  maximumPages?: number;
  maximumPayload?: number;
}

export interface ExtractResultField {
  rawValue: string;
  normalizedValue: string;
  validatedValue: string | null;
  confidence: number;
  sourcePage: number;
  extractionMethod: ExtractionStrategy;
  needsReview: boolean;
  warnings: string[];
}

export interface DocumentExtractionResult {
  fields: Record<string, ExtractResultField>;
  status: 'COMPLETED' | 'NO_NATIVE_TEXT' | 'NATIVE_TEXT_UNPARSED' | 'UNSUPPORTED_DOCUMENT_LAYOUT' | 'LOW_CONFIDENCE';
  message: string;
  strategyUsed: ExtractionStrategy;
}
