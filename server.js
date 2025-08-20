// server.js
const express = require('express');
const path = require('path');
const cloneApi = require('./api/clone-0');

const app = cloneApi; // Reuse the same express app

const PORT = 3000;

// Serve frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Route: serve index.html on root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


app.listen(PORT, () => {
  console.log(`🚀 Running on http://localhost:${PORT}`);
});
