const express = require('express');
const app = express();
const path = require('path');

// Pterodactyl gibt uns den Port über eine Umgebungsvariable.
// Der Fallback auf Port 3000 ist nur für lokales Testen.
const PORT = process.env.SERVER_PORT || 3000;

app.use(express.json());

const dbPath = path.join(__dirname, 'benana.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Fehler beim Verbinden mit der Datenbank:', err.message);
  } else {
    console.log('Erfolgreich mit der SQLite-Datenbank verbunden.');
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    )`, (err) => {
      if (err) {
        console.error('Fehler beim Erstellen der Tabelle "users":', err.message);
      } else {
        console.log('Tabelle "users" ist bereit.');
      }
    });
  }
});

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