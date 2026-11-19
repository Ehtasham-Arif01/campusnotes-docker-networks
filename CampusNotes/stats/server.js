/**
 * CampusNotes Stats
 * -----------------
 * Lives only on public_net. It has NO route to MongoDB and gets its
 * numbers by calling the API over the internal Docker DNS name `api`.
 */
const express = require('express');
const cors = require('cors');

const PORT = Number(process.env.PORT) || 3001;
const API_URL = process.env.API_URL || 'http://api:3000';
const TIMEOUT_MS = 3000;

const app = express();
app.use(cors());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/stats', async (req, res) => {
  try {
    const r = await fetch(`${API_URL}/count`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!r.ok) throw new Error(`API responded with ${r.status}`);
    const data = await r.json();
    res.json({
      service: 'stats',
      total_notes: data.total_notes,
      source: 'api',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(502).json({ error: 'Could not reach API', details: err.message });
  }
});

app.use((req, res) => res.status(404).json({ error: 'not found' }));

const server = app.listen(PORT, '0.0.0.0', () => console.log(`Stats listening on ${PORT}`));

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
