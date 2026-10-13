import { Module } from '@nestjs/common';
import { OcrEngine, TesseractOcrEngine } from './ocr.engine';

@Module({
  providers: [{ provide: OcrEngine, useClass: TesseractOcrEngine }],
  exports: [OcrEngine],
})
export class OcrModule {}
