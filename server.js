// server.js
const app = require('./api/clone'); // reuse Express app
const express = require('express');
const path = require('path');

const PORT = 3000;

// Serve static files from "public"
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html on root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
