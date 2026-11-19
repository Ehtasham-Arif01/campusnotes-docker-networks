/**
 * CampusNotes API
 * ----------------
 * The only service attached to BOTH networks:
 *   - public_net  -> reachable by frontend / admin / stats
 *   - private_net -> can reach MongoDB (which is never exposed)
 */
const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const PORT = Number(process.env.PORT) || 3000;
const MONGO_URL = process.env.MONGO_URL || 'mongodb://mongo:27017';
const DB_NAME = process.env.DB_NAME || 'campusnotes';
const MAX_TITLE = 120;
const MAX_TEXT = 5000;

const app = express();
app.use(cors());
app.use(express.json({ limit: '16kb' }));

const client = new MongoClient(MONGO_URL);
let notes = null;

// Keep retrying until MongoDB is ready (it may start after the API).
async function connectMongo() {
  for (;;) {
    try {
      await client.connect();
      notes = client.db(DB_NAME).collection('notes');
      await notes.createIndex({ createdAt: -1 });
      console.log(`Connected to MongoDB at ${MONGO_URL}`);
      return;
    } catch (err) {
      console.log(`MongoDB not ready (${err.message}), retrying in 3s...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

// Wrap async handlers so rejected promises reach the error middleware.
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// Reject DB routes with 503 until Mongo is connected.
const requireDb = (req, res, next) =>
  notes ? next() : res.status(503).json({ error: 'database not ready' });

app.get('/health', (req, res) => {
  res.json({ status: 'ok', mongo: Boolean(notes) });
});

app.get('/notes', requireDb, wrap(async (req, res) => {
  const all = await notes.find().sort({ createdAt: -1 }).toArray();
  res.json(all);
}));

app.post('/notes', requireDb, wrap(async (req, res) => {
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';

  if (!text) return res.status(400).json({ error: 'text is required' });
  if (title.length > MAX_TITLE) return res.status(400).json({ error: `title must be at most ${MAX_TITLE} characters` });
  if (text.length > MAX_TEXT) return res.status(400).json({ error: `text must be at most ${MAX_TEXT} characters` });

  const note = { title: title || 'Untitled', text, createdAt: new Date() };
  const result = await notes.insertOne(note);
  res.status(201).json({ _id: result.insertedId, ...note });
}));

app.get('/count', requireDb, wrap(async (req, res) => {
  const total = await notes.countDocuments();
  res.json({ total_notes: total });
}));

app.use((req, res) => res.status(404).json({ error: 'not found' }));

app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: status === 500 ? 'internal server error' : err.message });
});

const server = app.listen(PORT, '0.0.0.0', () => console.log(`API listening on ${PORT}`));
connectMongo();

// Graceful shutdown on `docker compose down`.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`${sig} received, shutting down...`);
    server.close(() => client.close().finally(() => process.exit(0)));
  });
}
