import 'dotenv/config';
import OpenAI from 'openai';

export const BASE_URL = 'https://api.meta.ai/v1';

export function apiKey(): string {
  const key = process.env.MODEL_API_KEY;
  if (!key) throw new Error('MODEL_API_KEY is not set (put it in .env)');
  return key;
}

let client: OpenAI | null = null;
export function meta(): OpenAI {
  client ??= new OpenAI({ baseURL: BASE_URL, apiKey: apiKey(), maxRetries: 3, timeout: 180_000 });
  return client;
}

// Public result sheets can go to Contributor mode (much cheaper); uploads from users stay in Standard mode.
export const SPARK_PUBLIC = process.env.SPARK_PUBLIC_MODEL ?? 'muse-spark-1.3-contributor';
export const SPARK_PRIVATE = 'muse-spark-1.3';
