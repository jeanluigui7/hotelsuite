// Declaración mínima de ua-parser-js (v1) para el subconjunto que usamos (clasificación de dispositivo).
declare module 'ua-parser-js' {
  export interface UAParserDevice {
    type?: string; // 'mobile' | 'tablet' | 'console' | 'smarttv' | 'wearable' | 'embedded' | undefined
    model?: string;
    vendor?: string;
  }
  export class UAParser {
    constructor(uastring?: string);
    getDevice(): UAParserDevice;
  }
  export default UAParser;
}
