import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url().default("http://localhost:3000"),
    APP_SECRET: z.string().min(32).default("development-only-secret-at-least-32-characters"),
    DATABASE_URL: z.string().min(1),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_FROM: z.string().default("OpenRoster <noreply@example.com>"),
    SMTP_SECURE: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    INVITE_TOKEN_TTL_DAYS: z.coerce.number().int().positive().max(30).default(7),
    SESSION_TTL_DAYS: z.coerce.number().int().positive().max(90).default(30),
  })
  .superRefine((value, context) => {
    if (
      value.NODE_ENV === "production" &&
      process.env.npm_lifecycle_event !== "build" &&
      (value.APP_SECRET === "change-me" ||
        value.APP_SECRET.startsWith("development-only") ||
        value.APP_SECRET.startsWith("replace-with"))
    ) {
      context.addIssue({
        code: "custom",
        path: ["APP_SECRET"],
        message: "APP_SECRET must be a strong, unique production secret.",
      });
    }
  });

export const env = envSchema.parse(process.env);
