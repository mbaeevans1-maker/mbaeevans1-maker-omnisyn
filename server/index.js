import './lib/async-guard.js';
import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './db.js';
import { attachUser, originGuard } from './middleware.js';
import { HttpError } from './lib/util.js';
import authRoutes from './routes/auth.js';
import tenantRoutes from './routes/tenant.js';
import adminRoutes from './routes/admin.js';
import publicRoutes from './routes/public.js';
import webhookRoutes from './routes/webhooks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.join(__dirname, '..', 'dist', 'client');
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "connect-src 'self'",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  );
  next();
});

app.use(
  express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
      if (buf?.length) req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: false, limit: '256kb' }));
app.use(cookieParser());
app.use(attachUser);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'mavyron', time: new Date().toISOString() });
});

app.use('/api/webhooks', webhookRoutes);
app.use('/api', originGuard);
app.use('/api/auth', authRoutes);
app.use('/api/tenant', tenantRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', publicRoutes);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: { message: 'Endpoint not found.', code: 'not_found' } });
});

if (fs.existsSync(CLIENT_DIR)) {
  app.use(
    express.static(CLIENT_DIR, {
      index: false,
      setHeaders: (res, filePath) => {
        if (/\/assets\//.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    }),
  );
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(CLIENT_DIR, 'index.html'));
  });
} else {
  app.get('*', (_req, res) => {
    res.status(503).type('text/plain').send('Client build not found. Run `npm run build` first.');
  });
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (err instanceof HttpError) {
    if (err.details) res.status(err.status).json({ error: { message: err.message, code: err.code, details: err.details } });
    else res.status(err.status).json({ error: { message: err.message, code: err.code } });
    return;
  }
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ error: { message: 'Request payload too large.', code: 'payload_too_large' } });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { message: 'Malformed JSON body.', code: 'bad_json' } });
    return;
  }
  console.error('[mavyron] unhandled error', req.method, req.originalUrl, err?.stack || err);
  res.status(500).json({ error: { message: 'Something went wrong. Please try again.', code: 'server_error' } });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`[mavyron] listening on http://${HOST}:${PORT}`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`[mavyron] ${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 8000).unref();
  });
}
