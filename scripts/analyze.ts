// Usage: npm run analyze -- <slug> [--limit N] [--lga NAME] [--concurrency N] [--retry-errors] [--push]
import 'dotenv/config';
import { runElection } from '../server/lib/worker.ts';

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
await runElection(args[0], {
  limit: opt('limit') ? Number(opt('limit')) : undefined,
  lga: opt('lga'),
  concurrency: Number(opt('concurrency') ?? 6),
  retryErrors: args.includes('--retry-errors'),
  push: args.includes('--push'),
});
