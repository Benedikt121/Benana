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

    db.run(`CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL)`, (err) => {
      if (err) {
        console.error('Fehler beim Erstellen der Tabelle "games":', err.message);
      } else {
        console.log('Tabelle "games" ist bereit.');
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
app.post('/api/login', async (req, res) => { // Die Hauptfunktion ist async
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Benutzername und Passwort sind erforderlich.' });
  }

  const sql = `SELECT * FROM users WHERE username = ?`;

  try {
    // Schritt 1: Benutzer aus der DB holen (mit Promise)
    const user = await new Promise((resolve, reject) => {
      db.get(sql, [username], (err, row) => {
        if (err) {
          console.error('Datenbankfehler beim Login (Promise):', err.message);
          // Wichtig: Hier noch keine Antwort senden, nur den Fehler weitergeben
          reject(new Error('Interner Serverfehler bei DB-Abfrage.')); 
        } else {
          resolve(row); // Gibt den gefundenen Benutzer (oder undefined) zurück
        }
      });
    });

    // Schritt 2: Prüfen, ob Benutzer gefunden wurde
    if (!user) {
      console.log(`Loginversuch für nicht existierenden Benutzer: ${username}`);
      return res.status(401).json({ message: 'Ungültiger Benutzername oder Passwort.' });
    }

    // Schritt 3: Passwort vergleichen (jetzt außerhalb des db.get callbacks)
    const isMatch = await bcrypt.compare(password, user.password);

    if (isMatch) {
      console.log(`Benutzer ${username} erfolgreich eingeloggt.`);
      return res.status(200).json({
        message: 'Login erfolgreich.',
        userId: user.id,
        username: user.username
      });
    } else {
      console.log(`Ungültiger Loginversuch (falsches Passwort) für Benutzer: ${username}`);
      return res.status(401).json({ message: 'Ungültiger Benutzername oder Passwort.' });
    }

  } catch (error) {
    // Fängt Fehler aus dem Promise (db.get) ODER aus bcrypt.compare ab
    console.error('Fehler im Login-Prozess:', error);
    // Stelle sicher, dass hier nur eine Antwort gesendet wird, falls noch keine gesendet wurde
    if (!res.headersSent) {
        // Unterscheide ggf. den DB-Fehler vom bcrypt-Fehler, falls nötig
        if (error.message.includes('DB-Abfrage')) {
             return res.status(500).json({ message: 'Datenbankfehler beim Login.' });
        } else {
             return res.status(500).json({ message: 'Fehler beim Passwortvergleich.' });
        }
    } else {
        // Wenn Header schon gesendet wurden (sollte nicht passieren), nur loggen
        console.error("ERR_HTTP_HEADERS_SENT - Konnte Fehlerantwort nicht senden, da bereits eine Antwort gesendet wurde.");
    }
  }
});

app.get('/api/games', (req, res) => {
  const sql = 'SELECT * FROM games ORDER BY name ASC';
  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error('Fehler beim Abrufen der Spiele:', err.message);
      return res.status(500).json({ error: 'Interner Serverfehler.' });
    }
    res.status(200).json(rows);
  });
});

app.post('/api/games', (req, res) => {
  const { name } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Spielname ist erforderlich.' });
  }

  const sql = 'INSERT INTO games (name) VALUES (?)';
  db.run(sql, [name.trim()], function(err) {
    if (err) {
      if(err.message.includes('UNIQUE constraint failed: games.name')) {
        return res.status(409).json({ error: 'Spielname ist bereits vorhanden.' });
      }
      console.error('Fehler beim Einfügen des Spiels:', err.message);
      return res.status(500).json({ error: 'Interner Serverfehler.' });
    }
    res.status(201).json({ message: 'Spiel erfolgreich hinzugefügt.', gameId: this.lastID });
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