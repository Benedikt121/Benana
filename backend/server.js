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

let activeKniffelGame = {
  isActive: false,
  players: [], // { userId: number, username: string, socketId: string }
  scoreboards: {}, // Format: { "userId_1": [ ...13 ScoreboardRow-Objekte... ], "userId_2": [ ... ] }
  totalScores: {}, // Format: { "userId_1": { upper: 0, ... }, "userId_2": { ... } }

  currentPlayerSocketId: null, 
  
  currentDice: [], // Format: { die: { value: 6 }, isHeld: false }
  rollCount: 0, // 0, 1, 2, oder 3
  
  lastRollNotation: null // z.B. "5d6@1,4,4,5,2"
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

function createNewScoreboard() {
  return [
    { id: 'ones', name: 'Einser', section: 'upper', score: null, potentialScore: 0, isSet: false },
    { id: 'twos', name: 'Zweier', section: 'upper', score: null, potentialScore: 0, isSet: false },
    { id: 'threes', name: 'Dreier', section: 'upper', score: null, potentialScore: 0, isSet: false },
    { id: 'fours', name: 'Vierer', section: 'upper', score: null, potentialScore: 0, isSet: false },
    { id: 'fives', name: 'Fünfer', section: 'upper', score: null, potentialScore: 0, isSet: false },
    { id: 'sixes', name: 'Sechser', section: 'upper', score: null, potentialScore: 0, isSet: false },
    { id: 'threeOfAKind', name: 'Dreierpasch', section: 'lower', score: null, potentialScore: 0, isSet: false },
    { id: 'fourOfAKind', name: 'Viererpasch', section: 'lower', score: null, potentialScore: 0, isSet: false },
    { id: 'fullHouse', name: 'Full House', section: 'lower', score: null, potentialScore: 0, isSet: false },
    { id: 'smallStraight', name: 'Kleine Straße', section: 'lower', score: null, potentialScore: 0, isSet: false },
    { id: 'largeStraight', name: 'Große Straße', section: 'lower', score: null, potentialScore: 0, isSet: false },
    { id: 'kniffel', name: 'Kniffel', section: 'lower', score: null, potentialScore: 0, isSet: false },
    { id: 'chance', name: 'Chance', section: 'lower', score: null, potentialScore: 0, isSet: false },
  ];
}

/**
 * Berechnet die Gesamtpunktzahl für ein einzelnes Scoreboard
 */
function calculateTotals(scoreboard) {
  const totals = { upper: 0, bonus: 0, upperTotal: 0, lowerTotal: 0, grandTotal: 0 };
  let upperScore = 0;
  scoreboard
    .filter(r => r.section === 'upper' && r.isSet)
    .forEach(r => upperScore += r.score || 0);
  
  totals.upper = upperScore;
  totals.bonus = (upperScore >= 63) ? 35 : 0;
  totals.upperTotal = totals.upper + totals.bonus;

  let lowerScore = 0;
  scoreboard
    .filter(r => r.section === 'lower' && r.isSet)
    .forEach(r => lowerScore += r.score || 0);

  totals.lowerTotal = lowerScore;
  totals.grandTotal = totals.upperTotal + totals.lowerTotal;
  return totals;
}

/**
 * Berechnet die potenziellen Punkte für ein Scoreboard basierend auf einem Wurf
 */
function updatePotentialScores(scoreboard, diceValues) {
    if (diceValues.length === 0) {
      scoreboard.forEach(row => row.potentialScore = 0);
      return;
    }
    const counts = getDiceCounts(diceValues);
    scoreboard.forEach(row => {
      if (!row.isSet) {
        switch (row.id) {
          case 'ones': row.potentialScore = calculateSumOfNumber(diceValues, 1); break;
          case 'twos': row.potentialScore = calculateSumOfNumber(diceValues, 2); break;
          case 'threes': row.potentialScore = calculateSumOfNumber(diceValues, 3); break;
          case 'fours': row.potentialScore = calculateSumOfNumber(diceValues, 4); break;
          case 'fives': row.potentialScore = calculateSumOfNumber(diceValues, 5); break;
          case 'sixes': row.potentialScore = calculateSumOfNumber(diceValues, 6); break;
          case 'threeOfAKind': row.potentialScore = calculateThreeOfAKind(diceValues, counts); break;
          case 'fourOfAKind': row.potentialScore = calculateFourOfAKind(diceValues, counts); break;
          case 'fullHouse': row.potentialScore = calculateFullHouse(counts); break;
          case 'smallStraight': row.potentialScore = calculateSmallStraight(diceValues); break;
          case 'largeStraight': row.potentialScore = calculateLargeStraight(diceValues); break;
          case 'kniffel': row.potentialScore = calculateKniffel(counts); break;
          case 'chance': row.potentialScore = calculateChance(diceValues); break;
        }
      }
    });
}

function getDiceCounts(diceValues) {
  const counts = new Map();
  for (const val of diceValues) {
    counts.set(val, (counts.get(val) || 0) + 1);
  }
  return counts;
}
function calculateSumOfNumber(diceValues, targetNumber) {
  return diceValues.filter(val => val === targetNumber).reduce((sum, val) => sum + val, 0);
}
function calculateChance(diceValues) {
  return diceValues.reduce((sum, val) => sum + val, 0);
}
function calculateThreeOfAKind(diceValues, counts) {
  for (const count of counts.values()) {
    if (count >= 3) return calculateChance(diceValues);
  }
  return 0;
}
function calculateFourOfAKind(diceValues, counts) {
  for (const count of counts.values()) {
    if (count >= 4) return calculateChance(diceValues);
  }
  return 0;
}
function calculateFullHouse(counts) {
  const values = Array.from(counts.values());
  if ((values.includes(3) && values.includes(2)) || values.includes(5)) return 25;
  return 0;
}
function calculateSmallStraight(diceValues) {
  const uniqueDice = new Set(diceValues);
  if (uniqueDice.has(1) && uniqueDice.has(2) && uniqueDice.has(3) && uniqueDice.has(4)) return 30;
  if (uniqueDice.has(2) && uniqueDice.has(3) && uniqueDice.has(4) && uniqueDice.has(5)) return 30;
  if (uniqueDice.has(3) && uniqueDice.has(4) && uniqueDice.has(5) && uniqueDice.has(6)) return 30;
  return 0;
}
function calculateLargeStraight(diceValues) {
  const uniqueDice = new Set(diceValues);
  if (uniqueDice.has(1) && uniqueDice.has(2) && uniqueDice.has(3) && uniqueDice.has(4) && uniqueDice.has(5)) return 40;
  if (uniqueDice.has(2) && uniqueDice.has(3) && uniqueDice.has(4) && uniqueDice.has(5) && uniqueDice.has(6)) return 40;
  return 0;
}
function calculateKniffel(counts) {
  if (Array.from(counts.values()).includes(5)) return 50;
  return 0;
}
function generateRandomRolls(count) {
  const rolls = [];
  for (let i = 0; i < count; i++) {
    rolls.push(Math.floor(Math.random() * 6) + 1);
  }
  return rolls;
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

function broadcastKniffelState() {
  // Wir senden den Zustand an jeden Spieler, der im Spiel ist
  for (const player of activeKniffelGame.players) {
    // 'io.to(socketId)' sendet nur an diesen einen Socket
    io.to(player.socketId).emit('kniffel:stateUpdate', activeKniffelGame);
  }
  console.log("Broadcast Kniffel Status an " + activeKniffelGame.players.length + " Spieler.");
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

    db.run(`CREATE TABLE IF NOT EXISTS kniffel_games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
      if (err) console.error('Fehler beim Erstellen der Tabelle "kniffel_games":', err.message);
      else console.log('Tabelle "kniffel_games" ist bereit.');
    });

    db.run(`CREATE TABLE IF NOT EXISTS kniffel_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      grand_total INTEGER NOT NULL,
      FOREIGN KEY (game_id) REFERENCES kniffel_games (id),
      FOREIGN KEY (user_id) REFERENCES users (id)  
    )`, (err) => {
      if (err) console.error('Fehler beim erstellen der Tabelle "kniffel_scores": ', err.message);
      else console.log('Tabelle "kniffel_scores" erfolgreich erstellt.')
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
        console.log(`Spieler ${userData.username} hat versucht, erneut beizutreten.`);
         // Sicherstellen, dass die Socket ID aktuell ist, falls der User sich neu verbunden hat
        const playerIndex = activeOlympiade.players.findIndex(p => p.userId === userData.userId);
        if (playerIndex > -1) {
            activeOlympiade.players[playerIndex].socketId = socket.id;
        }
    }
  });

  socket.on('selectNextGame', ({ type, gameId }) => { // type = 'manual' | 'random'
      if (!activeOlympiade.isActive || activeOlympiade.players.length < 1) { // Mindestens 1 Spieler
          return socket.emit('olympiadeError', { message: 'Olympiade nicht aktiv oder keine Spieler.' });
      }
      if (activeOlympiade.results.length >= activeOlympiade.selectedGamesList.length) {
          console.log(`Fehler: selectNextGame obwohl results(${activeOlympiade.results.length}) >= games(${activeOlympiade.selectedGamesList.length})`);
          return socket.emit('olympiadeError', { message: 'Alle Spiele wurden bereits gespielt.' });
      }
      if (activeOlympiade.currentGameIndex > activeOlympiade.results.length) {
           console.log(`Fehler: selectNextGame obwohl index(${activeOlympiade.currentGameIndex}) > results(${activeOlympiade.results.length})`);
           return socket.emit('olympiadeError', { message: 'Das aktuelle Spiel muss erst bewertet werden.' });
      }

      let nextGameIndex = -1;
      if (type === 'manual' && typeof gameId === 'number') {
          if (activeOlympiade.results.some(r => r.gameId === gameId)) {
             return socket.emit('olympiadeError', { message: 'Dieses Spiel wurde bereits gespielt.' });
          }
          const potentialIndex = activeOlympiade.selectedGamesList.findIndex(g => g.id === gameId);
          if (potentialIndex > -1) {
              nextGameIndex = potentialIndex;
          } else {
              return socket.emit('olympiadeError', { message: 'Spiel-ID nicht in dieser Olympiade gefunden.' });
          }

      } else if (type === 'random') {
          const playedGameIds = new Set(activeOlympiade.results.map(r => r.gameId));
          const availableGames = activeOlympiade.selectedGamesList.filter(game => !playedGameIds.has(game.id));

          if (availableGames.length > 0) {
             const randomGame = availableGames[Math.floor(Math.random() * availableGames.length)];
             nextGameIndex = activeOlympiade.selectedGamesList.findIndex(g => g.id === randomGame.id);

             const targetGame = activeOlympiade.selectedGamesList[nextGameIndex];
             const availableGamesForWheel = availableGames;

             console.log(`Sende spinTargetDetermined: target=${targetGame.id}, available=${availableGamesForWheel.length} Spiele`);
             io.emit('spinTargetDetermined', {
               targetGameId: targetGame.id,
               availableGames: availableGamesForWheel
             });

              setTimeout(() => {
                 activeOlympiade.currentGameIndex = nextGameIndex;
                 broadcastOlympiadeStatus();
                 console.log(`Timeout abgelaufen: Setze currentGameIndex auf ${nextGameIndex}`);
               }, 5200);
               return;
           } else {
             return socket.emit('olympiadeError', { message: 'Keine Spiele mehr verfügbar.' });
          }
      } else {
          return socket.emit('olympiadeError', { message: 'Ungültige Spielauswahl.' });
      }

      if (nextGameIndex > -1) {
          activeOlympiade.currentGameIndex = nextGameIndex;
          console.log(`Nächstes Spiel (Index ${activeOlympiade.currentGameIndex}): ${activeOlympiade.selectedGamesList[activeOlympiade.currentGameIndex]?.name}`);
          broadcastOlympiadeStatus();
      }
  });

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

  socket.on('kniffel:joinGame', (userData) => {
      if (!userData || typeof userData.userId !== 'number') return;
      
      const existingPlayer = activeKniffelGame.players.find(p => p.userId === userData.userId);

      if (!existingPlayer) {
        console.log(`Kniffel: Spieler ${userData.username} tritt bei.`);
        activeKniffelGame.isActive = true;
        // Spieler zur Liste hinzufügen
        activeKniffelGame.players.push({
          userId: userData.userId,
          username: userData.username,
          socketId: socket.id
        });
        
        // Neues Scoreboard und Totals für diesen Spieler erstellen
        activeKniffelGame.scoreboards[userData.userId] = createNewScoreboard();
        activeKniffelGame.totalScores[userData.userId] = { upper: 0, bonus: 0, upperTotal: 0, lowerTotal: 0, grandTotal: 0 };
        
        // Ersten Spieler zum aktuellen Spieler machen
        if (activeKniffelGame.players.length === 1) {
          activeKniffelGame.currentPlayerSocketId = socket.id;
        }
      } else {
        console.log(`Kniffel: Spieler ${userData.username} verbindet sich erneut.`);
        // Spieler ist schon drin, nur Socket-ID aktualisieren (wichtig für Reconnect)
        existingPlayer.socketId = socket.id;
      }
      
      // Sende den aktuellen Zustand an ALLE Spieler
      broadcastKniffelState();
    });

    socket.on('kniffel:rollDice', () => {
      // Validierung: Nur der aktuelle Spieler darf würfeln
      if (socket.id !== activeKniffelGame.currentPlayerSocketId) return;
      if (activeKniffelGame.rollCount >= 3) return;

      activeKniffelGame.rollCount++;
      
      let notation = '';
      let allValues = [];
      let newDiceState = [];

      if (activeKniffelGame.rollCount === 1) {
        // --- Erster Wurf ---
        allValues = generateRandomRolls(5);
        notation = `5d6@${allValues.join(',')}`;
        // Alle Würfel sind neu und nicht gehalten
        newDiceState = allValues.map(val => ({ die: { value: val }, isHeld: false }));

      } else {
        // --- Zweiter oder dritter Wurf ---
        const heldDice = activeKniffelGame.currentDice.filter(kd => kd.isHeld);
        const heldValues = heldDice.map(kd => kd.die.value);
        
        const newRollsCount = 5 - heldDice.length;
        if (newRollsCount === 0) {
           // Sollte nicht passieren, da Button gesperrt ist, aber sicher ist sicher
           activeKniffelGame.rollCount--;
           return;
        }

        const newValues = generateRandomRolls(newRollsCount);
        allValues = [...heldValues, ...newValues];
        notation = `5d6@${allValues.join(',')}`;

        // Wir müssen den 'isHeld'-Status korrekt wiederherstellen (Logik von V15 'updateLocalDiceState')
        const heldDicePool = [...heldDice]; // Kopie der gehaltenen Würfel
        newDiceState = allValues.map(val => {
            // Versuche, einen gehaltenen Würfel mit diesem Wert zu finden
            const heldMatchIndex = heldDicePool.findIndex(hd => hd.die.value === val);
            if (heldMatchIndex > -1) {
                // Ja, das ist einer unserer gehaltenen Würfel.
                // Entferne ihn aus dem Pool, damit er nicht doppelt verwendet wird.
                return heldDicePool.splice(heldMatchIndex, 1)[0];
            } else {
                // Nein, das ist ein neuer Würfel.
                return { die: { value: val }, isHeld: false };
            }
        });
      }

      // Sortiere den finalen Würfelstatus für konsistente Anzeige
      newDiceState.sort((a, b) => a.die.value - b.die.value);

      // Aktualisiere den Server-Zustand
      activeKniffelGame.lastRollNotation = notation;
      activeKniffelGame.currentDice = newDiceState;
      
      // Potenzielle Punkte für den aktuellen Spieler neu berechnen
      const currentPlayer = activeKniffelGame.players.find(p => p.socketId === socket.id);
      if (!currentPlayer) return;
      
      const scoreboard = activeKniffelGame.scoreboards[currentPlayer.userId];
      updatePotentialScores(scoreboard, allValues);
      
      // Nach dem 3. Wurf alle Würfel sperren
      if (activeKniffelGame.rollCount === 3) {
        activeKniffelGame.currentDice.forEach(kd => kd.isHeld = true);
      }

      broadcastKniffelState();
    });

    socket.on('kniffel:toggleHold', (data) => {
      // Validierung
      if (socket.id !== activeKniffelGame.currentPlayerSocketId || data.index == null) return;
      if (activeKniffelGame.rollCount === 0 || activeKniffelGame.rollCount === 3) return;

      const die = activeKniffelGame.currentDice[data.index];
      if (die) {
        die.isHeld = !die.isHeld;
        // Sende nur ein kleines Update an alle
        broadcastKniffelState();
      }
    });

    socket.on('kniffel:selectScore', (data) => {
      // Validierung
      if (socket.id !== activeKniffelGame.currentPlayerSocketId || !data.rowId) return;
      if (activeKniffelGame.rollCount === 0) return;

      const currentPlayer = activeKniffelGame.players.find(p => p.socketId === socket.id);
      if (!currentPlayer) return;

      const scoreboard = activeKniffelGame.scoreboards[currentPlayer.userId];
      const row = scoreboard.find(r => r.id === data.rowId);

      if (!row || row.isSet) {
        console.log("Fehler: Zeile bereits gesetzt oder nicht gefunden.");
        return; // Zeile schon gesetzt oder ungültig
      }

      // 1. Punkte eintragen
      row.score = row.potentialScore;
      row.isSet = true;
      console.log(`Kniffel: ${currentPlayer.username} trägt ${row.score} für ${row.name} ein.`);

      // 2. Gesamtpunktzahl neu berechnen
      activeKniffelGame.totalScores[currentPlayer.userId] = calculateTotals(scoreboard);

      // 3. Nächste Runde vorbereiten (Zustand zurücksetzen)
      activeKniffelGame.rollCount = 0;
      activeKniffelGame.currentDice = [];
      activeKniffelGame.lastRollNotation = null;
      // Setze alle potenziellen Scores für *diesen* Spieler zurück
      scoreboard.forEach(r => r.potentialScore = 0);

      // 4. Prüfen, ob das Spiel vorbei ist
      const allDone = activeKniffelGame.players.every(p => 
        activeKniffelGame.scoreboards[p.userId].every(r => r.isSet)
      );
      
      if (allDone) {
        console.log("Kniffel-Spiel beendet!");
        activeKniffelGame.isActive = false;
        activeKniffelGame.currentPlayerSocketId = null;
        // (Hier könnte man Ergebnisse in der DB speichern)
      } else {
        // 5. Nächsten Spieler bestimmen
        const currentIndex = activeKniffelGame.players.findIndex(p => p.socketId === socket.id);
        const nextIndex = (currentIndex + 1) % activeKniffelGame.players.length;
        activeKniffelGame.currentPlayerSocketId = activeKniffelGame.players[nextIndex].socketId;
        console.log(`Kniffel: Nächster Spieler ist ${activeKniffelGame.players[nextIndex].username}.`);
      }

      // 6. Finalen Zustand der Runde an alle senden
      broadcastKniffelState();
    });

    socket.on('kniffel:newGame', () => {
      console.log("Kniffel: Neues Spiel wird gestartet.");
      // Setze den Hauptzustand zurück
      activeKniffelGame.isActive = true;
      activeKniffelGame.currentDice = [];
      activeKniffelGame.rollCount = 0;
      activeKniffelGame.lastRollNotation = null;
      
      // Setze Scoreboards und Totals für alle Spieler zurück
      activeKniffelGame.players.forEach(player => {
        activeKniffelGame.scoreboards[player.userId] = createNewScoreboard();
        activeKniffelGame.totalScores[player.userId] = { upper: 0, bonus: 0, upperTotal: 0, lowerTotal: 0, grandTotal: 0 };
      });
      
      // Erster Spieler in der Liste beginnt
      if (activeKniffelGame.players.length > 0) {
        activeKniffelGame.currentPlayerSocketId = activeKniffelGame.players[0].socketId;
      }

      broadcastKniffelState();
    });

socket.on('kniffel:saveGame', () => {
  // Nur beendete Spiele speichern
  if (activeKniffelGame.isActive || activeKniffelGame.players.length === 0) {
    console.error("Kniffel: Versuch, ein aktives oder leeres Spiel zu speichern.");
    return;
  }

  console.log("Kniffel: Spiel wird gespeichert...");
  const gameToSave = { ...activeKniffelGame };

  db.serialize(() => {
    // Schritt 1: Das Spiel-Objekt erstellen, um eine game_id zu erhalten
    db.run('INSERT INTO kniffel_games (date) VALUES (CURRENT_TIMESTAMP)', function(err) {
      if (err) {
        console.error("Fehler beim Erstellen des kniffel_games Eintrags:", err.message);
        return;
      }

      const gameId = this.lastID;
      console.log(`Kniffel-Spiel ${gameId} gespeichert.`);

      // Schritt 2: Die Scores für jeden Spieler mit der neuen game_id speichern
      const stmt = db.prepare('INSERT INTO kniffel_scores (game_id, user_id, grand_total) VALUES (?, ?, ?)');
      for (const player of gameToSave.players) {
        const totalScore = gameToSave.totalScores[player.userId]?.grandTotal ?? 0;
        stmt.run(gameId, player.userId, totalScore, (errP) => {
           if(errP) console.error(`Fehler beim Speichern von Kniffel-Score für User ${player.userId}:`, errP.message);
        });
      }
      stmt.finalize((errF) => {
         if(errF) console.error("Fehler beim Finalisieren der Score-Einträge:", errF.message);
         else console.log(`Alle Scores für Kniffel-Spiel ${gameId} gespeichert.`);
      });

      // Schritt 3: Spielstatus auf dem Server zurücksetzen
      activeKniffelGame = {
        isActive: false, players: [], scoreboards: {}, totalScores: {},
        currentPlayerSocketId: null, currentDice: [], rollCount: 0, lastRollNotation: null
      };

      // Schritt 4: Client bestätigen, dass gespeichert wurde
      socket.emit('kniffel:gameSaved');
    });
  });
});

  socket.on('disconnect', () => {
    console.log('Benutzer hat die Verbindung getrennt:', socket.id);
    
    // --- Bestehende Olympiade-Logik ---
    const olyPlayerIndex = activeOlympiade.players.findIndex(p => p.socketId === socket.id);
    if (activeOlympiade.isActive && olyPlayerIndex > -1) {
      const removedPlayer = activeOlympiade.players.splice(olyPlayerIndex, 1)[0];
      console.log(`Spieler ${removedPlayer.username} hat die Olympiade verlassen.`);
      broadcastOlympiadeStatus();
    }
    const kniffelPlayerIndex = activeKniffelGame.players.findIndex(p => p.socketId === socket.id);
    if (activeKniffelGame.isActive && kniffelPlayerIndex > -1) {
      const removedPlayer = activeKniffelGame.players.splice(kniffelPlayerIndex, 1)[0];
      console.log(`Kniffel: Spieler ${removedPlayer.username} hat das Spiel verlassen.`);

      // Aufräumen: Scoreboard und Totals dieses Spielers löschen
      delete activeKniffelGame.scoreboards[removedPlayer.userId];
      delete activeKniffelGame.totalScores[removedPlayer.userId];

      // Prüfen, ob der Spieler dran war
      if (socket.id === activeKniffelGame.currentPlayerSocketId) {
        // Ja, war er. Nächsten Spieler bestimmen.
        if (activeKniffelGame.players.length > 0) {
          // Der 'nächste' Spieler ist jetzt der an der aktuellen Position (da der alte weg ist)
          const nextIndex = kniffelPlayerIndex % activeKniffelGame.players.length;
          activeKniffelGame.currentPlayerSocketId = activeKniffelGame.players[nextIndex].socketId;
        } else {
          // Letzter Spieler hat das Spiel verlassen
          activeKniffelGame.currentPlayerSocketId = null;
        }
      }
      
      // Wenn keine Spieler mehr da sind, Spiel zurücksetzen
      if (activeKniffelGame.players.length === 0) {
        console.log("Kniffel: Letzter Spieler hat verlassen. Setze Spiel zurück.");
        activeKniffelGame = { // (Zurück zum Standardzustand)
          isActive: false, players: [], scoreboards: {}, totalScores: {},
          currentPlayerSocketId: null, currentDice: [], rollCount: 0, lastRollNotation: null
        };
      }
      broadcastKniffelState();
    }
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(angularDistPath,'index.html'));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server läuft und lauscht auf Port ${PORT}`);
});