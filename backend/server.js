const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const { PORT, FRONTEND_URL, NODE_ENV } = require('./src/config/env');

const app = express();

// Import routes
const authRoutes = require('./src/routes/auth');
const usageRoutes = require('./src/routes/usage');
const stripeRoutes = require('./src/routes/stripe');

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Health check endpoint (before other routes to avoid conflicts)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', environment: NODE_ENV });
});

// Stripe webhook needs raw body - must be before express.json()
app.use('/api/stripe/webhook', stripeRoutes);

// Parse JSON for all other routes
app.use(express.json());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/usage', usageRoutes);
app.use('/api/stripe', stripeRoutes);

// Serve static files from frontend build (production)
if (NODE_ENV === 'production') {
  const frontendBuildPath = path.join(__dirname, '../frontend/build');
  app.use(express.static(frontendBuildPath));

  // Catch-all handler: send back index.html for any request that doesn't match API routes
  // Express 5+ requires regex instead of '*' for catch-all routes
  app.get(/.*/, (req, res) => {
    res.sendFile(path.join(frontendBuildPath, 'index.html'));
  });
} else {
  // In development, frontend runs separately on Vite dev server
  // API only - 404 for non-API routes
  app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📦 Environment: ${NODE_ENV}`);
  console.log(`🌐 Frontend URL: ${FRONTEND_URL}`);
});
