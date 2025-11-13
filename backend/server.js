const express = require('express');
const cors = require('cors');
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

// Stripe webhook needs raw body - must be before express.json()
app.use('/api/stripe/webhook', stripeRoutes);

// Parse JSON for all other routes
app.use(express.json());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/usage', usageRoutes);
app.use('/api/stripe', stripeRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', environment: NODE_ENV });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📦 Environment: ${NODE_ENV}`);
  console.log(`🌐 Frontend URL: ${FRONTEND_URL}`);
});
