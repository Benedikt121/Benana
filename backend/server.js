const express = require('express');
const app = express();
const path = require('path');

// Pterodactyl gibt uns den Port über eine Umgebungsvariable.
// Der Fallback auf Port 3000 ist nur für lokales Testen.
const PORT = process.env.SERVER_PORT || 3000;

const angularDistPath = path.join(__dirname, '../frontend/dist/frontend/browser');

app.use(express.static(angularDistPath));

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(angularDistPath,'index.html'));
});

// Wir lauschen auf '0.0.0.0', damit der Server von außerhalb
// des Containers (also vom Nginx-Proxy) erreichbar ist.
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server läuft und lauscht auf Port ${PORT}`);
});