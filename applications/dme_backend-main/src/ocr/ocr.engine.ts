import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { tmpdir } from 'os';
import { join } from 'path';
import { createWorker, type Worker } from 'tesseract.js';

export interface OcrResult {
  text: string;
  /** 0 to 100, as reported by the engine. */
  confidence: number;
  engine: string;
}

/**
 * Turns a photo of notes into text. Swap the provider in OcrModule to use
 * a cloud service (better on handwriting) without touching the endpoint.
 */
export abstract class OcrEngine {
  abstract recognize(image: Buffer): Promise<OcrResult>;
}

/**
 * Open-source OCR running on the server (Tesseract, French + English).
 * Good on printed or neat text, weak on cursive handwriting. Language data
 * is downloaded on first use and cached in the temp folder.
 */
@Injectable()
export class TesseractOcrEngine extends OcrEngine implements OnModuleDestroy {
  private readonly logger = new Logger(TesseractOcrEngine.name);
  private worker: Promise<Worker> | null = null;

  async recognize(image: Buffer): Promise<OcrResult> {
    const worker = await this.getWorker();
    const { data } = await worker.recognize(image);
    return {
      text: data.text.replace(/\n{3,}/g, '\n\n').trim(),
      confidence: Math.round(data.confidence),
      engine: 'tesseract',
    };
  }

  async onModuleDestroy() {
    if (this.worker) await (await this.worker).terminate();
  }

  private getWorker() {
    this.worker ??= createWorker(['fra', 'eng'], 1, {
      cachePath: join(tmpdir(), 'dme-tesseract'),
    }).catch((error: unknown) => {
      this.worker = null; // retry on the next scan
      this.logger.error('OCR engine could not start', String(error));
      throw error;
    });
    return this.worker;
  }
}
