import 'dotenv/config';

// Where indexes and analyses live. Locally ./data; on Railway a mounted volume.
export const DATA_DIR = process.env.DATA_DIR ?? 'data';
