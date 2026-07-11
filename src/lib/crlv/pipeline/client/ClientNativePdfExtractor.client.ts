'use client';

export class ClientNativePdfExtractor {
  
  static async extractTokens(file: File) {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer, useSystemFonts: true, disableFontFace: true });
    
    const startTime = Date.now();
    const doc = await loadingTask.promise;
    const numPages = doc.numPages;
    const pages = [];

    for (let i = 1; i <= numPages; i++) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1.0 });

      const tokens = (textContent.items as any[]).map(item => ({
        text: item.str,
        normalizedText: item.str.trim(),
        page: i,
        x: Math.round(item.transform[4]),
        y: Math.round(item.transform[5]),
        width: item.width || 0,
        height: item.height || 0,
        fontSize: null,
        direction: null
      })).filter(t => t.normalizedText.length > 0);

      const pageText = tokens.map(t => t.text).join(' ');

      pages.push({
        pageNumber: i,
        text: pageText,
        tokens,
        width: viewport.width,
        height: viewport.height,
        rotation: page.rotate
      });
    }

    return {
      pages,
      pdfjsVersion: pdfjsLib.version,
      durationMs: Date.now() - startTime
    };
  }
}
