const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth.routes');
const widgetRoutes = require('./routes/widget.routes');
const submissionRoutes = require('./routes/submission.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();

// Security: Disable Express fingerprinting header
app.disable('x-powered-by');

// Serve versioned embeddable widget script with 1-year immutable caching
app.get('/widget.v1.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.sendFile(path.join(__dirname, 'public', 'widget.v1.js'));
});

// Handle favicon requests cleanly without 404 noise
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Enforce boundary payload limit (protect against memory exhaustion / DoS)
app.use(express.json({ limit: config.maxPayloadSize }));
app.use(express.urlencoded({ extended: true, limit: config.maxPayloadSize }));

// Basic CORS configuration for configured origins
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (config.cors.allowedOrigins.includes('*') || config.cors.allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, true); // Permissive default for cross-origin widget delivery
    },
    credentials: true,
  })
);

// Mount API Routes
app.use('/health', healthRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/widgets', widgetRoutes);
app.use('/api/v1/submissions', submissionRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);

// Minimal Owner Dashboard Static UI
app.use('/dashboard', express.static(path.join(__dirname, 'public', 'dashboard')));
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard', 'index.html'));
});

// Root informational endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'FlyRank Embeddable Widget Platform API',
    status: 'online',
    version: '1.0.0',
    documentation: '/DESIGN.md',
    health: '/health',
  });
});

// Handle undefined routes
app.use(notFoundHandler);

// Central error handling middleware
app.use(errorHandler);

module.exports = app;
