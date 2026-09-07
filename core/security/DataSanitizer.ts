// core/security/DataSanitizer.ts

export type SanitizationMode = "strict" | "balanced" | "minimal";

export interface SanitizationOptions {
  readonly mode?: SanitizationMode;
  readonly redactEmails?: boolean;
  readonly redactPhones?: boolean;
  readonly redactUrls?: boolean;
  readonly redactApiKeys?: boolean;
  readonly redactSecrets?: boolean;
  readonly replacement?: string;
}

export interface SanitizationResult {
  readonly text: string;
  readonly changed: boolean;
  readonly redactions: number;
  readonly categories: readonly string[];
}

interface SanitizationRule {
  readonly category: string;
  readonly pattern: RegExp;
  readonly replacement?: string;
}

export class DataSanitizer {
  private readonly defaults: Required<Omit<SanitizationOptions, "mode">> & {
    mode: SanitizationMode;
  };

  public constructor(options: SanitizationOptions = {}) {
    const mode = options.mode ?? "balanced";

    this.defaults = {
      mode,
      redactEmails: options.redactEmails ?? mode !== "minimal",
      redactPhones: options.redactPhones ?? mode === "strict",
      redactUrls: options.redactUrls ?? false,
      redactApiKeys: options.redactApiKeys ?? true,
      redactSecrets: options.redactSecrets ?? true,
      replacement: options.replacement ?? "[REDACTED]",
    };
  }

  public sanitize(
    value: string,
    options: SanitizationOptions = {},
  ): SanitizationResult {
    if (!value) {
      return {
        text: value,
        changed: false,
        redactions: 0,
        categories: [],
      };
    }

    const config = {
      ...this.defaults,
      ...options,
    };

    const rules = this.buildRules(config);

    let text = value;
    let redactions = 0;
    const categories = new Set<string>();

    for (const rule of rules) {
      text = text.replace(rule.pattern, (...args: unknown[]) => {
        const match = args[0];

        if (typeof match !== "string") {
          return rule.replacement ?? config.replacement;
        }

        redactions++;
        categories.add(rule.category);

        return rule.replacement ?? config.replacement;
      });
    }

    return {
      text,
      changed: text !== value,
      redactions,
      categories: [...categories],
    };
  }

  public sanitizeObject<T>(value: T, options: SanitizationOptions = {}): T {
    return this.walk(value, options) as T;
  }

  private buildRules(
    config: SanitizationOptions & {
      replacement?: string;
    },
  ): SanitizationRule[] {
    const rules: SanitizationRule[] = [];

    if (config.redactEmails) {
      rules.push({
        category: "email",
        pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      });
    }

    if (config.redactPhones) {
      rules.push({
        category: "phone",
        pattern: /(?<!\w)(?:\+?\d[\d\s().-]{7,}\d)(?!\w)/g,
      });
    }

    if (config.redactUrls) {
      rules.push({
        category: "url",
        pattern: /\bhttps?:\/\/[^\s<>"']+/gi,
      });
    }

    if (config.redactApiKeys) {
      rules.push(
        {
          category: "openai_api_key",
          pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g,
        },
        {
          category: "google_api_key",
          pattern: /\bAIza[0-9A-Za-z_-]{20,}\b/g,
        },
        {
          category: "github_token",
          pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
        },
        {
          category: "bearer_token",
          pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/gi,
        },
      );
    }

    if (config.redactSecrets) {
      rules.push(
        {
          category: "password",
          pattern:
            /(\bpassword\b|\bpasswd\b|\bsecret\b)\s*[:=]\s*["']?[^"',\s]+["']?/gi,
        },
        {
          category: "private_key",
          pattern:
            /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
        },
      );
    }

    return rules;
  }

  private walk(value: unknown, options: SanitizationOptions): unknown {
    if (typeof value === "string") {
      return this.sanitize(value, options).text;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.walk(item, options));
    }

    if (value && typeof value === "object") {
      const result: Record<string, unknown> = {};

      for (const [key, item] of Object.entries(value)) {
        if (/password|secret|token|apiKey|privateKey/i.test(key)) {
          result[key] = "[REDACTED]";
          continue;
        }

        result[key] = this.walk(item, options);
      }

      return result;
    }

    return value;
  }
}