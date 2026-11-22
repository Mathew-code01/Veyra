// Global type declarations for modules without types
declare module "@huggingface/transformers" {
  export interface PipelineOptions {
    quantized?: boolean;
    device?: "webgpu" | "wasm" | "cpu";
    dtype?: "q4" | "q8" | "fp32" | "fp16";
    progress_callback?: (progress: { file: string; progress: number; total: number }) => void;
  }

  export interface Tokenizer {
    encode(text: string): { input_ids: number[]; attention_mask: number[] };
    decode(tokenIds: number[], skip_special_tokens?: boolean): string;
    pad_token_id: number;
    eos_token_id: number;
  }

  export interface Model {
    generate(input: { input_ids: number[]; attention_mask: number[] }, options?: {
      max_new_tokens?: number;
      do_sample?: boolean;
      temperature?: number;
      top_p?: number;
      top_k?: number;
    }): Promise<number[][]>;
  }

  export const AutoTokenizer: {
    from_pretrained(modelId: string, options?: PipelineOptions): Promise<Tokenizer>;
  };

  export const AutoModel: {
    from_pretrained(modelId: string, options?: PipelineOptions): Promise<Model>;
  };

  export const pipeline: (task: string, modelId: string, options?: PipelineOptions) => Promise<unknown>;

  export const env: {
    allowLocalModels: boolean;
    allowRemoteModels: boolean;
    useBrowserCache: boolean;
    useFS: boolean;
    localModelPath: string;
  };
}