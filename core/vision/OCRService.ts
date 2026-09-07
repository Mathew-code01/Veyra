// core/vision/OCRService.ts

export interface OCRRequest {
  readonly image: Uint8Array;
  readonly mimeType: string;
  readonly language?: string;
  readonly signal?: AbortSignal;
}

export interface OCRWord {
  readonly text: string;
  readonly confidence?: number;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
}

export interface OCRBlock {
  readonly text: string;
  readonly confidence?: number;
  readonly words?: readonly OCRWord[];
}

export interface OCRResult {
  readonly text: string;
  readonly confidence?: number;
  readonly language?: string;
  readonly blocks: readonly OCRBlock[];
  readonly provider: string;
  readonly durationMs: number;
}

export interface OCRProvider {
  readonly name: string;

  recognize(request: OCRRequest): Promise<OCRResult>;
}

export class OCRService {
  private readonly providers = new Map<string, OCRProvider>();

  private defaultProvider?: string;

  public register(provider: OCRProvider, makeDefault = false): void {
    this.providers.set(provider.name, provider);

    if (makeDefault || !this.defaultProvider) {
      this.defaultProvider = provider.name;
    }
  }

  public unregister(providerName: string): void {
    this.providers.delete(providerName);

    if (this.defaultProvider === providerName) {
      this.defaultProvider = this.providers.keys().next().value;
    }
  }

  public get(providerName?: string): OCRProvider {
    const name = providerName ?? this.defaultProvider;

    if (!name) {
      throw new Error("No OCR provider is configured.");
    }

    const provider = this.providers.get(name);

    if (!provider) {
      throw new Error(`OCR provider "${name}" is unavailable.`);
    }

    return provider;
  }

  public async recognize(
    request: OCRRequest,
    providerName?: string,
  ): Promise<OCRResult> {
    if (!request.image.length) {
      throw new Error("OCR image cannot be empty.");
    }

    return this.get(providerName).recognize(request);
  }

  public list(): readonly OCRProvider[] {
    return [...this.providers.values()];
  }
}