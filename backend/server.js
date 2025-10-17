const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
// Add your routes here

// Start server
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
