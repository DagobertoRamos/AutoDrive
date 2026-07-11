'use client';

export class LocalOcrProvider {
  
  static async extractFromImages(imageUrls: string[]) {
    const { createWorker } = await import('tesseract.js');
    
    // Configured for locally hosted assets!
    const worker = await createWorker('por', 1, {
      workerPath: '/tesseract/worker.min.js',
      corePath: '/tesseract', // Needs to contain tesseract-core.wasm etc
      langPath: '/tesseract/lang', // Needs to contain por.traineddata.gz
      gzip: true,
    });

    const pages = [];
    const startTime = Date.now();

    try {
      for (let i = 0; i < imageUrls.length; i++) {
        const { data } = await worker.recognize(imageUrls[i]);
        pages.push({
          pageNumber: i + 1,
          text: data.text,
          confidence: data.confidence,
        });
      }
    } finally {
      await worker.terminate();
    }

    return pages;
  }
}
