// desktop/preload/types.ts

// desktop/preload/types.ts

export interface WindowOperationResult {
  readonly success: boolean;
  readonly reason?: string;
  readonly maximized?: boolean;
}

export interface VeyraDesktopAPI {
  readonly app: {
    getVersion(): Promise<string>;
    getPlatform(): Promise<NodeJS.Platform>;
    getEnvironment(): Promise<
      "development" | "production"
    >;
  };

  readonly window: {
    minimize(): Promise<WindowOperationResult>;
    maximize(): Promise<WindowOperationResult>;
    close(): Promise<WindowOperationResult>;
    isMaximized(): Promise<boolean>;
    isAvailable(): Promise<boolean>;
  };
}