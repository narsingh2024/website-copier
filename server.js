// server.js
const app = require('./api/clone'); // Reuse the same Express app
const PORT = 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
