const express = require('express');
const app = express();
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const http = require('http');
const { Server } = require("socket.io");

const PORT = process.env.SERVER_PORT || 3000;
const allowedOrigins = [
  'https://benana.me',
  'http://localhost:4200'];

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    allowedHeaders: ["*"],
    credentials: true
  }
});

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

app.use(express.json());

let activeOlympiade = {
  isActive: false,
  gameIds: null,
  selectedGamesList: [], // { id: number, name: string }
  players: [], // { userId: number, username: string, score: number, socketId: string }
  currentGameIndex: -1,
  results: [], // { gameId: number, round: number, winnerUserId: number, pointsAwarded: number }
  hostSocketId: null
};

async function getGamesByIds(idsString) {
  if (!idsString) return [];
  const ids = idsString.split(',').map(Number);
  const placeholders = ids.map(() => '?').join(',');
  const sql = `SELECT id, name FROM games WHERE id IN (${placeholders})`;
  return new Promise((resolve, reject) => {
    db.all(sql, ids, (err, rows) => {
      if (err) {
        console.error("Fehler beim Abrufen der Spieldetails:", err);
        reject([]);
      } else {
        // Sortiere die Ergebnisse in der Reihenfolge der IDs, falls gewünscht
         const sortedRows = ids.map(id => rows.find(row => row.id === id)).filter(Boolean);
        resolve(sortedRows);
      }
    });
  });
}

// Hilfsfunktion zum Senden des aktuellen Status an alle
function broadcastOlympiadeStatus() {
    // Nur relevante Daten senden, nicht z.B. socketId
    const statusToSend = {
        isActive: activeOlympiade.isActive,
        gameIds: activeOlympiade.gameIds, // Frontend kennt die IDs schon
        selectedGamesList: activeOlympiade.selectedGamesList,
        players: activeOlympiade.players.map(({ socketId, ...rest }) => rest), // socketId weglassen
        currentGameIndex: activeOlympiade.currentGameIndex,
        results: activeOlympiade.results
    };
  io.emit('olympiadeStatusUpdate', statusToSend);
  console.log("Broadcast Olympiade Status:", statusToSend);
}

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
      name TEXT UNIQUE NOT NULL
    )`, (err) => {
      if (err) {
        console.error('Fehler beim Erstellen der Tabelle "games":', err.message);
      } else {
        console.log('Tabelle "games" ist bereit.');
        db.get('SELECT COUNT(*) as count FROM games', (err, row) => {
          if (!err && row.count === 0) {
            const initialGames = ['Speedrunners'];
            const stmt = db.prepare('INSERT OR IGNORE INTO games (name) VALUES (?)');
            initialGames.forEach(game => stmt.run(game));
            stmt.finalize((err) => {
              if (!err) console.log('Standardspiele hinzugefügt.');
            });
          }
        });
      }
    });
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS olympiades (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT DEFAULT CURRENT_TIMESTAMP,
          game_ids TEXT NOT NULL
        )`, (err) => {
          if (err) console.error('Fehler beim Erstellen der Tabelle "olympiades":', err.message);
          else console.log('Tabelle "olympiades" ist bereit.');
        });

        db.run(`CREATE TABLE IF NOT EXISTS olympiade_players (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          olympiade_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          final_score INTEGER NOT NULL,
          FOREIGN KEY (olympiade_id) REFERENCES olympiades (id),
          FOREIGN KEY (user_id) REFERENCES users (id)
        )`, (err) => {
          if (err) console.error('Fehler beim Erstellen der Tabelle "olympiade_players":', err.message);
          else console.log('Tabelle "olympiade_players" ist bereit.');
        });

        db.run(`CREATE TABLE IF NOT EXISTS olympiade_results (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          olympiade_id INTEGER NOT NULL,
          game_id INTEGER NOT NULL,
          round_number INTEGER NOT NULL,
          winner_user_id INTEGER NOT NULL,
          points_awarded INTEGER NOT NULL,
          FOREIGN KEY (olympiade_id) REFERENCES olympiades (id),
          FOREIGN KEY (game_id) REFERENCES games (id),
          FOREIGN KEY (winner_user_id) REFERENCES users (id)
        )`, (err) => {
          if (err) console.error('Fehler beim Erstellen der Tabelle "olympiade_results":', err.message);
          else console.log('Tabelle "olympiade_results" ist bereit.');
        });
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
    res.status(201).json({ message: 'Spiel erfolgreich hinzugefügt.', gameId: this.lastID, name: name.trim() });
  });
});

app.get('/api/olympiade/status', (req, res) => {
  res.status(200).json(activeOlympiade);
});

io.on('connection', (socket) => {
  console.log('Ein Benutzer hat sich verbunden:', socket.id);

  socket.emit('olympiadeStatusUpdate', {
      isActive: activeOlympiade.isActive,
      gameIds: activeOlympiade.gameIds,
      selectedGamesList: activeOlympiade.selectedGamesList,
      players: activeOlympiade.players.map(({ socketId, ...rest }) => rest),
      currentGameIndex: activeOlympiade.currentGameIndex,
      results: activeOlympiade.results
  });

  // --- Bestehende Events ---
  socket.on('startOlympiade', async (data) => {
    if (activeOlympiade.isActive) {
      return socket.emit('olympiadeError', { message: 'Es läuft bereits eine Olympiade.' });
    }
    if (data && typeof data.gameIds === 'string' && data.gameIds.length > 0) {
      try {
        activeOlympiade.isActive = true;
        activeOlympiade.gameIds = data.gameIds;
        // Lade die Spiel-Details
        activeOlympiade.selectedGamesList = await getGamesByIds(data.gameIds); // Warten bis Spiele geladen
        activeOlympiade.players = []; // Spielerliste leeren
        activeOlympiade.currentGameIndex = -1; // Kein Spiel ausgewählt
        activeOlympiade.results = []; // Ergebnisse leeren
        activeOlympiade.hostSocketId = socket.id; // Optional: Den Starter als Host markieren
        console.log(`Olympiade gestartet via Socket ${socket.id} mit Spielen:`, activeOlympiade.selectedGamesList);
        broadcastOlympiadeStatus(); // Sendet den aktualisierten Status an alle
      } catch (error) {
         socket.emit('olympiadeError', { message: 'Fehler beim Laden der Spieldetails.' });
         // Reset state if game loading failed
         activeOlympiade.isActive = false;
         activeOlympiade.gameIds = null;
         activeOlympiade.selectedGamesList = [];
      }
    } else {
      socket.emit('olympiadeError', { message: 'Ungültige gameIds beim Starten' });
    }
  });

socket.on('endOlympiade', () => {
  if (activeOlympiade.isActive) {
    console.log(`Olympiade beendet via Socket ${socket.id}. Speichere Ergebnisse...`);
    const olympiadeToSave = { ...activeOlympiade }; // Kopiere den aktuellen Zustand

    db.serialize(() => {
      const stmtOlympiade = db.prepare('INSERT INTO olympiades (game_ids) VALUES (?)');
      stmtOlympiade.run(olympiadeToSave.gameIds, function(err) {
        if (err) return console.error("Fehler beim Speichern der Olympiade:", err.message);
        const olympiadeId = this.lastID;
        console.log("Olympiade gespeichert mit ID:", olympiadeId);

        const stmtPlayer = db.prepare('INSERT INTO olympiade_players (olympiade_id, user_id, final_score) VALUES (?, ?, ?)');
        olympiadeToSave.players.forEach(p => {
          stmtPlayer.run(olympiadeId, p.userId, p.score, (errP) => {
            if(errP) console.error(`Fehler beim Speichern von Spieler ${p.userId}:`, errP.message);
          });
        });
        stmtPlayer.finalize();

        const stmtResult = db.prepare('INSERT INTO olympiade_results (olympiade_id, game_id, round_number, winner_user_id, points_awarded) VALUES (?, ?, ?, ?, ?)');
        olympiadeToSave.results.forEach(r => {
           stmtResult.run(olympiadeId, r.gameId, r.round, r.winnerUserId, r.pointsAwarded, (errR) => {
              if(errR) console.error(`Fehler beim Speichern von Ergebnis für Spiel ${r.gameId}:`, errR.message);
           });
        });
        stmtResult.finalize();
      });
      stmtOlympiade.finalize();
    });
  }
  activeOlympiade.isActive = false;
  activeOlympiade.gameIds = null;
  activeOlympiade.selectedGamesList = [];
  activeOlympiade.players = [];
  activeOlympiade.currentGameIndex = -1;
  activeOlympiade.results = [];
  activeOlympiade.hostSocketId = null;
  broadcastOlympiadeStatus();
});


  // --- Neue Events ---
  socket.on('joinOlympiade', (userData) => {
    if (!activeOlympiade.isActive) {
      return socket.emit('olympiadeError', { message: 'Keine aktive Olympiade zum Beitreten.' });
    }
    if (!userData || typeof userData.userId !== 'number' || typeof userData.username !== 'string') {
       return socket.emit('olympiadeError', { message: 'Ungültige Benutzerdaten.' });
    }
    // Prüfen, ob Spieler schon drin ist
    if (!activeOlympiade.players.some(p => p.userId === userData.userId)) {
      activeOlympiade.players.push({
        userId: userData.userId,
        username: userData.username,
        score: 0,
        socketId: socket.id // Wichtig für Disconnect-Handling
      });
      console.log(`Spieler ${userData.username} (ID: ${userData.userId}) ist beigetreten.`);
      broadcastOlympiadeStatus(); // Spielerliste an alle senden
    } else {
        // Optional: Dem Spieler mitteilen, dass er schon drin ist
        // socket.emit('alreadyJoined');
        console.log(`Spieler ${userData.username} hat versucht, erneut beizutreten.`);
         // Sicherstellen, dass die Socket ID aktuell ist, falls der User sich neu verbunden hat
        const playerIndex = activeOlympiade.players.findIndex(p => p.userId === userData.userId);
        if (playerIndex > -1) {
            activeOlympiade.players[playerIndex].socketId = socket.id;
        }
    }
  });

  // =================================================================
  // HIER IST DIE WICHTIGE ÄNDERUNG
  // =================================================================
  socket.on('selectNextGame', ({ type, gameId }) => { // type = 'manual' | 'random'
      if (!activeOlympiade.isActive || activeOlympiade.players.length < 1) { // Mindestens 1 Spieler
          return socket.emit('olympiadeError', { message: 'Olympiade nicht aktiv oder keine Spieler.' });
      }

      // *** KORREKTUR 1: Prüfen, ob alle Spiele bereits *gespielt* wurden ***
      // Verwendet results.length statt currentGameIndex
      if (activeOlympiade.results.length >= activeOlympiade.selectedGamesList.length) {
          console.log(`Fehler: selectNextGame obwohl results(${activeOlympiade.results.length}) >= games(${activeOlympiade.selectedGamesList.length})`);
          return socket.emit('olympiadeError', { message: 'Alle Spiele wurden bereits gespielt.' });
      }

      // *** KORREKTUR 2: Prüfen, ob ein Spiel bereits ausgewählt wurde und auf Bewertung wartet ***
      // Vergleicht currentGameIndex mit der Anzahl der Ergebnisse
      if (activeOlympiade.currentGameIndex > activeOlympiade.results.length) {
           console.log(`Fehler: selectNextGame obwohl index(${activeOlympiade.currentGameIndex}) > results(${activeOlympiade.results.length})`);
           return socket.emit('olympiadeError', { message: 'Das aktuelle Spiel muss erst bewertet werden.' });
      }

      let nextGameIndex = -1;
      if (type === 'manual' && typeof gameId === 'number') {
          // (Manuelle Logik bleibt gleich, ist aber anfällig für dieselben Fehler)
          // Bessere manuelle Logik (optional):
          // 1. Prüfen, ob gameId bereits in results vorhanden ist
          if (activeOlympiade.results.some(r => r.gameId === gameId)) {
             return socket.emit('olympiadeError', { message: 'Dieses Spiel wurde bereits gespielt.' });
          }
          // 2. Index finden
          const potentialIndex = activeOlympiade.selectedGamesList.findIndex(g => g.id === gameId);
          if (potentialIndex > -1) {
              nextGameIndex = potentialIndex;
          } else {
              return socket.emit('olympiadeError', { message: 'Spiel-ID nicht in dieser Olympiade gefunden.' });
          }

      } else if (type === 'random') {
          // *** KORREKTUR 3: Verfügbare Spiele basierend auf 'results', nicht auf 'currentGameIndex' filtern ***
          const playedGameIds = new Set(activeOlympiade.results.map(r => r.gameId));
          const availableGames = activeOlympiade.selectedGamesList.filter(game => !playedGameIds.has(game.id));

          if (availableGames.length > 0) {
             const randomGame = availableGames[Math.floor(Math.random() * availableGames.length)];
             // Finde den *echten Index* dieses Spiels in der selectedGamesList
             nextGameIndex = activeOlympiade.selectedGamesList.findIndex(g => g.id === randomGame.id);

             // --- Angepasste Glücksrad-Logik ---
             const targetGame = activeOlympiade.selectedGamesList[nextGameIndex];
             const availableGamesForWheel = availableGames; // Die bereits gefilterte Liste

             // Sende das Ziel und die Liste für das Rad *sofort* an alle Clients
             console.log(`Sende spinTargetDetermined: target=${targetGame.id}, available=${availableGamesForWheel.length} Spiele`);
             io.emit('spinTargetDetermined', {
               targetGameId: targetGame.id,
               availableGames: availableGamesForWheel
             });

             // Starte den Timeout, um den *offiziellen* Spielstatus erst nach der Animation zu aktualisieren
              setTimeout(() => {
                 activeOlympiade.currentGameIndex = nextGameIndex;
                 broadcastOlympiadeStatus(); // Inklusive currentGameIndex
                 console.log(`Timeout abgelaufen: Setze currentGameIndex auf ${nextGameIndex}`);
               }, 5200); // 5 Sekunden warten (entspricht Animationsdauer im Frontend)
               return; // Wichtig: Beende hier, da der Status erst nach dem Timeout aktualisiert wird
           } else {
             // Diese Bedingung sollte jetzt mit KORREKTUR 1 übereinstimmen
             return socket.emit('olympiadeError', { message: 'Keine Spiele mehr verfügbar.' });
          }
      } else {
          return socket.emit('olympiadeError', { message: 'Ungültige Spielauswahl.' });
      }

      // Dieser Block wird nur noch für 'manual' erreicht (wenn KEIN Timeout verwendet wird)
      if (nextGameIndex > -1) {
          activeOlympiade.currentGameIndex = nextGameIndex;
          console.log(`Nächstes Spiel (Index ${activeOlympiade.currentGameIndex}): ${activeOlympiade.selectedGamesList[activeOlympiade.currentGameIndex]?.name}`);
          // Beim manuellen Auswählen muss der Status sofort gesendet werden
          broadcastOlympiadeStatus();
      }
  });
  // =================================================================
  // ENDE DER ÄNDERUNG
  // =================================================================


  socket.on('declareWinner', ({ winnerUserId }) => {
      if (!activeOlympiade.isActive || activeOlympiade.currentGameIndex < 0 || activeOlympiade.currentGameIndex >= activeOlympiade.selectedGamesList.length) {
          return socket.emit('olympiadeError', { message: 'Kein aktives Spiel ausgewählt.' });
      }

      // *** KORREKTUR 4: Sicherstellen, dass das Spiel, das bewertet wird, das 'currentGameIndex' Spiel ist ***
      const currentGame = activeOlympiade.selectedGamesList[activeOlympiade.currentGameIndex];
      if (!currentGame) {
          return socket.emit('olympiadeError', { message: 'Interner Fehler: Aktuelles Spiel nicht gefunden.'});
      }

      // Sicherstellen, dass für dieses Spiel noch kein Gewinner deklariert wurde
      if (activeOlympiade.results.some(r => r.gameId === currentGame.id)) {
          return socket.emit('olympiadeError', { message: 'Für dieses Spiel wurde bereits ein Gewinner deklariert.' });
      }

      const winnerPlayer = activeOlympiade.players.find(p => p.userId === winnerUserId);
      if (!winnerPlayer) {
          return socket.emit('olympiadeError', { message: 'Ungültiger Gewinner ausgewählt.' });
      }

      const roundNumber = activeOlympiade.results.length + 1; // 1-basiert
      const pointsAwarded = roundNumber; // Punkte = Rundennummer

      // Ergebnis speichern
      activeOlympiade.results.push({
          gameId: currentGame.id,
          round: roundNumber,
          winnerUserId: winnerUserId,
          pointsAwarded: pointsAwarded
      });

      // Punktestand aktualisieren
      const winnerIndex = activeOlympiade.players.findIndex(p => p.userId === winnerUserId);
      activeOlympiade.players[winnerIndex].score += pointsAwarded;
      activeOlympiade.currentGameIndex = -1;

      console.log(`Runde ${roundNumber} (${currentGame.name}): Gewinner ${winnerPlayer.username} erhält ${pointsAwarded} Punkte.`);

       // Prüfen, ob alle Spiele gespielt wurden
      if (activeOlympiade.results.length === activeOlympiade.selectedGamesList.length) {
         console.log("Olympiade abgeschlossen!");
         // Zuerst aber den finalen Status senden
         broadcastOlympiadeStatus();
         // Optional: Event für abgeschlossene Olympiade senden
         io.emit('olympiadeFinished', { results: activeOlympiade.results, players: activeOlympiade.players });
      } else {
         broadcastOlympiadeStatus();
      }
  });

  socket.on('disconnect', () => {
    console.log('Benutzer hat die Verbindung getrennt:', socket.id);
    // Spieler aus der aktiven Olympiade entfernen
    const playerIndex = activeOlympiade.players.findIndex(p => p.socketId === socket.id);
    if (activeOlympiade.isActive && playerIndex > -1) {
      const removedPlayer = activeOlympiade.players.splice(playerIndex, 1)[0];
      console.log(`Spieler ${removedPlayer.username} hat die Olympiade verlassen.`);
      broadcastOlympiadeStatus();
    }
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(angularDistPath,'index.html'));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server läuft und lauscht auf Port ${PORT}`);
});