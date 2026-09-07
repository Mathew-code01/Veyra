// client/src/app/config.ts

import { z } from "zod";

const ConfigSchema = z.object({
  environment: z
    .enum(["development", "test", "production"])
    .default("development"),

  apiUrl: z.string().url().optional(),

  appName: z.string().default("Veyra"),
});

const rawConfig = {
  environment: import.meta.env.MODE,

  apiUrl: import.meta.env.VITE_API_URL,

  appName: import.meta.env.VITE_APP_NAME ?? "Veyra",
};

export const config = ConfigSchema.parse(rawConfig);