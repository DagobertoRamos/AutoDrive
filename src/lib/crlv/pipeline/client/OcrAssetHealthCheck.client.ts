'use client';

export class OcrAssetHealthCheck {
  static async checkTesseractAssets(): Promise<boolean> {
    try {
      const res = await fetch('/tesseract/worker.min.js', { method: 'HEAD' });
      if (!res.ok) return false;
      const res2 = await fetch('/tesseract/tesseract-core-lstm.wasm', { method: 'HEAD' });
      return res2.ok;
    } catch {
      return false;
    }
  }

  static async checkPdfjsAssets(): Promise<boolean> {
    try {
      const res = await fetch('/pdfjs/pdf.worker.min.mjs', { method: 'HEAD' });
      return res.ok;
    } catch {
      return false;
    }
  }
}
