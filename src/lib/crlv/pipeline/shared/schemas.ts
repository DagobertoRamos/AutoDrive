import { z } from 'zod';

export const ExtractInitSchema = z.object({
  fileName: z.string().optional(),
  mimeType: z.string(),
  size: z.number().positive(),
  fileHash: z.string().length(64), // SHA-256
  documentType: z.string().optional(), // 'CRLV', 'CONTRATO', etc
});

export const TextResultSourceSchema = z.enum(['client_native_pdf', 'local_ocr']);

export const PositionedTokenSchema = z.object({
  text: z.string(),
  normalizedText: z.string(),
  page: z.number(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  fontSize: z.number().nullable(),
  direction: z.string().nullable(),
});

export const ClientPdfTextResultSchema = z.object({
  processingId: z.string(),
  processingToken: z.string(),
  source: z.literal('client_native_pdf'),
  pages: z.array(z.object({
    pageNumber: z.number(),
    text: z.string(),
    tokens: z.array(PositionedTokenSchema),
    width: z.number(),
    height: z.number(),
    rotation: z.number(),
  })),
  pdfjsVersion: z.string(),
  durationMs: z.number(),
});

export const LocalOcrTextResultSchema = z.object({
  processingId: z.string(),
  processingToken: z.string(),
  source: z.literal('local_ocr'),
  pages: z.array(z.object({
    pageNumber: z.number(),
    text: z.string(),
    confidence: z.number(),
  })),
  tesseractVersion: z.string(),
  language: z.string(),
  durationMs: z.number(),
});

export const TextResultSchema = z.discriminatedUnion('source', [
  ClientPdfTextResultSchema,
  LocalOcrTextResultSchema,
]);
