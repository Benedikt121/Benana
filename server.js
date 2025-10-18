const express = require('express');
const app = express();

// Pterodactyl gibt uns den Port über eine Umgebungsvariable.
// Der Fallback auf Port 3000 ist nur für lokales Testen.
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  // Diese Nachricht siehst du gleich im Browser!
  res.send('Hallo Welt von meinem eigenen benana.me Node.js-Server!');
});

// Wir lauschen auf '0.0.0.0', damit der Server von außerhalb
// des Containers (also vom Nginx-Proxy) erreichbar ist.
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server läuft und lauscht auf Port ${PORT}`);
});