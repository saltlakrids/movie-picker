import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createCatalog } from './catalog.js';
import { createApp } from './app.js';

try {
  process.loadEnvFile?.();
} catch {
  // no .env file — fine
}

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const db = openDb(process.env.DB_FILE || path.join(root, 'data/movie-picker.db'));
const catalog = createCatalog(db);
const app = createApp({ db, catalog, staticDir: path.join(root, 'web/dist') });

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  console.log(`Movie Picker API on http://localhost:${port}`);
  console.log(catalog.live
    ? `Catalog: live TMDB data for region ${catalog.region}`
    : 'Catalog: offline demo movies (set TMDB_API_KEY or TMDB_READ_TOKEN for the real catalog)');
});
