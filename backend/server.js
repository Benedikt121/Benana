const express = require('express');
const app = express();
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

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

// Benutzerregistrierung
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Benutzername und Passwort sind erforderlich.' });
  }

  try {
    const hasedPassword = await bcrypt.hash(password, 10);

    const sql = 'INSERT INTO users (username, password) VALUES (?, ?)';

    db.run(sql, [username, hasedPassword], function(err) {
      if (err) {
        if(err.message.includes('UNIQUE constraint failed: users.username')) {
          return res.status(409).json({ error: 'Benutzername ist bereits vergeben.' });
        }

        console.error('Fehler beim Einfügen des Benutzers:', err.message);
        return res.status(500).json({ error: 'Interner Serverfehler.' });
      }
      console.log(`Neuer Benutzer mit der ID ${this.lastID} erstellt.`);
      res.status(201).json({ message: 'Benutzer erfolgreich registriert.', userId: this.lastID });
    });
  } catch (error) {
    console.error('Fehler bei der Registrierung:', error.message);
    res.status(500).json({ error: 'Interner Serverfehler.' });
  }});

  // Benutzer-Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Benutzername und Passwort sind erforderlich.' });
  }

  const sql = 'SELECT * FROM users WHERE username = ?';

  db.get(sql, [username], async (err, user) => {
    if (err) {
      console.error('Fehler bei der Abfrage des Benutzers:', err.message);
      return res.status(500).json({ error: 'Interner Serverfehler.' });
    }

    try {
      const isMatch = await bcrypt.compare(password, user.password);

      if(isMatch) {
        res.json({ message: 'Login erfolgreich.' });
        res.status(200).json({
          message: 'Login erfolgreich.',
          userId: user.id,
          username: user.username
        });
      } else {
        console.log('Ungültige Anmeldeinformationen.');
        res.status(401).json({ error: 'Ungültiger Benutzername oder Passwort.' });
      }
    } catch (error) {
      console.error('Fehler bei der Passwortüberprüfung:', error.message);
      res.status(500).json({ error: 'Interner Serverfehler.' });
    }
  });
});
      
app.get('*', (req, res) => {
  res.sendFile(path.join(angularDistPath,'index.html'));
});

// Wir lauschen auf '0.0.0.0', damit der Server von außerhalb
// des Containers (also vom Nginx-Proxy) erreichbar ist.
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server läuft und lauscht auf Port ${PORT}`);
});