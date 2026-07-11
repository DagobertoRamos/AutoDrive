'use client';

export class ScannedPdfRenderer {
  
  static async renderToImages(file: File): Promise<string[]> {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';

    const arrayBuffer = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    const imageUrls = [];
    
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 }); // Scale for better OCR
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      imageUrls.push(dataUrl);
    }
    
    return imageUrls;
  }
}
