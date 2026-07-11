import 'server-only';

export class DocumentProcessingLogger {
  static info(message: string, context?: any) {
    console.log(`[DocumentProcessing] INFO: ${message}`, context ? JSON.stringify(context) : '');
  }
  static error(message: string, error: any, context?: any) {
    console.error(`[DocumentProcessing] ERROR: ${message}`, error, context ? JSON.stringify(context) : '');
  }
  static warn(message: string, context?: any) {
    console.warn(`[DocumentProcessing] WARN: ${message}`, context ? JSON.stringify(context) : '');
  }
}
