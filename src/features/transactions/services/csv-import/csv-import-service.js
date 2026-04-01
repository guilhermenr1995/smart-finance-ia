import { registerFileParseMethods } from './methods/file-parse-methods.js';
import { registerPdfMethods } from './methods/pdf-methods.js';
import { registerCsvLayoutMethods } from './methods/csv-layout-methods.js';

export class CsvImportService {
  constructor(config = {}) {
    this.minimumColumns = 3;
    this.pdfWorkerUrl =
      config.pdfWorkerUrl || 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    this.pdfLib = config.pdfLib || null;
  }
}

registerFileParseMethods(CsvImportService);
registerPdfMethods(CsvImportService);
registerCsvLayoutMethods(CsvImportService);
