import { Component, inject, signal, computed, WritableSignal, Signal, OnDestroy, AfterViewInit, ElementRef, viewChild, effect } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { COLORSETS } from '../dice-themes.const';
import { TEXTURELIST } from '../dice-textures.const';
// @ts-ignore
import DiceBox from '@3d-dice/dice-box-threejs';

// Interfaces für die empfangenen Daten
interface OlympiadeHistory {
  id: number;
  olympiade_id: number;
  user_id: number;
  final_score: number;
}
interface KniffelHistory {
  id: number;
  game_id: number;
  user_id: number;
  grand_total: number;
}
// Erweitertes Interface für Profildaten
interface ProfileData {
  userId: number;
  username: string;
  avatarUrl: string | null;
  personalColor: string;
  dice_config: string | null;
  olympiadeHistory: OlympiadeHistory[];
  kniffelHistory: KniffelHistory[];
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.html',
  styleUrl: './profile.css'
})
export class Profile implements OnDestroy, AfterViewInit {


  private authService = inject(AuthService);
  private http = inject(HttpClient);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  // Signale für die Ansicht
  userId: WritableSignal<number> = signal(0);
  username: WritableSignal<string> = signal('');
  avatarUrl: WritableSignal<string | null> = signal(null);
  personalColor: WritableSignal<string> = signal('#FFFFFF');
  olympiadeHistory: WritableSignal<OlympiadeHistory[]> = signal([]);
  kniffelHistory: WritableSignal<KniffelHistory[]> = signal([]);
  errorMessage: WritableSignal<string | null> = signal(null);
  uploadMessage: WritableSignal<string | null> = signal(null);
  diceConfig: WritableSignal<any> = signal(null);

  private createDefaultDiceConfig() {
    return { 
      theme_colorset: 'pinkdreams', 
      theme_texture: 'marble', 
      theme_material: 'plastic', 
      theme_customColorset: null 
    };
  }

  public colorsets = COLORSETS;
  public texturelist = TEXTURELIST;
  public colorsetKeys = Object.keys(this.colorsets);
  public textureKeys = Object.keys(this.texturelist).filter(key => key !== '');

  // "owner" wird ein 'computed' Signal
  owner: Signal<boolean> = computed(() => {
    return this.userId() > 0 && this.userId() === this.authService.getUserId();
  });

  dicePreviewBox = viewChild<ElementRef<HTMLDivElement>>('dicePreviewBox');
  public diceBoxInstance: any = null;
  private isDiceBoxInitialized: boolean = false;

  constructor() {
    this.route.params.subscribe(params => {
      const id = parseInt(params['id'], 10);
      if (isNaN(id)) {
        this.errorMessage.set("Ungültiges Profil.");
        return;
      }
      this.userId.set(id);
      this.fetchProfileData(id);
      this.createDefaultDiceConfig();
    });

    effect(() => {
      const config = this.diceConfig();
      if (config && this.isDiceBoxInitialized) {
        this.updateDiceBoxPreview(config);
      }
    });
  }

  ngAfterViewInit(): void {
    // Wir rufen die Initialisierung hier auf, aber sie wartet intern
    // darauf, dass die diceConfig geladen wird.
    this.initializeDiceBox();
  }

  ngOnDestroy(): void {
    if (this.diceBoxInstance && typeof this.diceBoxInstance.remove === 'function') {
      try {
        this.diceBoxInstance.remove();
        console.log("DiceBox-Vorschau entfernt.");
      } catch (e) {
        console.error("Fehler beim Entfernen der DiceBox-Instanz:", e);
      }
      this.diceBoxInstance = null;
    }
  }

  fetchProfileData(id: number) {
    this.errorMessage.set(null);
    this.http.get<ProfileData>(`/api/profile/${id}`).subscribe({
      next: (data) => {
        this.username.set(data.username);
        this.avatarUrl.set(data.avatarUrl);
        this.personalColor.set(data.personalColor || '#FFFFFF');
        this.olympiadeHistory.set(data.olympiadeHistory);
        this.kniffelHistory.set(data.kniffelHistory);
        this.diceConfig.set(data.dice_config);

        this.initializeDiceBox();
      },
      error: (err) => {
        console.error("Fehler beim Abrufen der Profildaten:", err);
        this.errorMessage.set(err.error?.message || 'Profil konnte nicht geladen werden.');
      }
    });
  }

  // NEU: Wird aufgerufen, wenn eine Datei ausgewählt wird
  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }
    const file = input.files[0];
    if (file.size > 2 * 1024 * 1024) { // 2MB Limit
       this.uploadMessage.set("Fehler: Datei ist zu groß (max. 2MB).");
       return;
    }

    const formData = new FormData();
    formData.append('avatar', file, file.name);

    this.uploadMessage.set("Lade Bild hoch...");

    // POST an den neuen Endpunkt, :id wird aus dem Signal genommen
    this.http.post<{ message: string, avatarUrl: string }>(`/api/profile/${this.userId()}/avatar`, formData)
      .subscribe({
        next: (res) => {
          this.avatarUrl.set(res.avatarUrl); // Avatar-Signal direkt aktualisieren
          this.uploadMessage.set("Profilbild erfolgreich geändert!");
        },
        error: (err) => {
          console.error("Avatar-Upload-Fehler:", err);
          this.uploadMessage.set(err.error?.error || 'Upload fehlgeschlagen.');
        }
      });
  }

  // NEU: Wird aufgerufen, wenn sich die Farbe ändert (beim Loslassen)
  onColorChange(event: Event) {
    const newColor = (event.target as HTMLInputElement).value;
    this.personalColor.set(newColor); // Optimistisches Update der UI

    this.http.put(`/api/profile/${this.userId()}/color`, { color: newColor })
      .subscribe({
        next: () => {
          console.log("Farbe gespeichert");
        },
        error: (err) => {
          console.error("Farbe-Speichern-Fehler:", err);
          this.uploadMessage.set("Fehler beim Speichern der Farbe.");
          // Hier könnte man die Farbe auf den alten Wert zurücksetzen
        }
      });
  }

  // Logout-Funktion
  logout() {
    this.authService.logout();
    this.router.navigate(['/']);
  }

  onThemeChange(event: Event) {
    const themeKey = (event.target as HTMLSelectElement).value;
    if (themeKey === 'custom') {
      // Auf "custom" gesetzt, wir löschen das Preset, behalten aber den Rest
      this.diceConfig.update(config => ({
        ...config,
        theme_colorset: null,
        // (theme_customColorset bleibt erhalten)
      }));
    } else {
      // Ein Preset wurde gewählt
      const theme = this.colorsets[themeKey];
      this.diceConfig.set({
        ...this.diceConfig(), // Behält z.B. eine bereits gewählte Textur, falls das Theme keine vorgibt
        theme_colorset: themeKey,
        theme_texture: theme.texture || this.diceConfig()?.theme_texture || 'none',
        theme_material: theme.material || 'plastic',
        theme_customColorset: null // Benutzerdefinierte Farben löschen
      });
    }
  }

  onTextureChange(event: Event) {
    const textureKey = (event.target as HTMLSelectElement).value;
    const texture = this.texturelist[textureKey];

    this.diceConfig.update(config => ({
      ...config,
      theme_texture: textureKey,
      // Material aktualisieren, falls die Textur eines vorschlägt
      theme_material: texture.material || config.theme_material || 'plastic' 
    }));
  }

  onCustomColorChange(event: Event) {
    const color = (event.target as HTMLInputElement).value;

    this.diceConfig.update(config => ({
      ...config,
      theme_colorset: null, // Preset-Auswahl aufheben
      theme_customColorset: {
        background: color,
        foreground: '#FFFFFF', // Standard-Vordergrund (könnte auch konfigurierbar gemacht werden)
        texture: config.theme_texture, // Aktuelle Textur beibehalten
        material: config.theme_material // Aktuelles Material beibehalten
      }
    }));
  }

  getCustomBgColor(): string {
    const config = this.diceConfig();
    if (config?.theme_customColorset?.background) {
      // Stellt sicher, dass es kein Array ist (wie bei manchen Presets)
      const bg = config.theme_customColorset.background;
      return Array.isArray(bg) ? bg[0] : bg;
    }
    return '#FFFFFF'; // Standard-Fallback
  }

  saveDiceConfig() {
    this.uploadMessage.set("Speichere Würfel-Design...");
    const configToSave = this.diceConfig();

    this.http.put<{ message: string, dice_config: any }>(`/api/profile/${this.userId()}/dice-config`, { config: configToSave })
      .subscribe({
        next: (res) => {
          this.uploadMessage.set(res.message);
          // WICHTIG: Die Konfiguration auch im lokalen AuthService aktualisieren!
          this.authService.updateDiceConfig(res.dice_config);
        },
        error: (err) => {
          console.error("Fehler beim Speichern der Würfel-Konfiguration:", err);
          this.uploadMessage.set(err.error?.error || 'Speichern fehlgeschlagen.');
        }
      });
  }

  private async initializeDiceBox() {
    const container = this.dicePreviewBox()?.nativeElement;
    const config = this.diceConfig();

    // Verhindern, dass die Funktion ausgeführt wird, bevor alles bereit ist
    if (!container || !config || this.isDiceBoxInitialized) {
      return;
    }

    this.isDiceBoxInitialized = true;
    console.log("Initialisiere DiceBox-Vorschau...");

    try {
      const previewConfig: any = {
        assetPath: "/assets/",
        sounds: false,
        shadows: true,
        baseScale: 80,
        light_intensity: 1.0,
        gravity_multiplier: 400,
        strength: 1.5,
        isInteractive: false // Keine Interaktion für die Vorschau
      };

      // Benutzerkonfiguration anwenden
      previewConfig.theme_material = config.theme_material;
      previewConfig.theme_texture = config.theme_texture;
      if (config.theme_customColorset) {
        previewConfig.theme_colorset = null;
        previewConfig.theme_customColorset = config.theme_customColorset;
      } else {
        previewConfig.theme_colorset = config.theme_colorset;
        previewConfig.theme_customColorset = null;
      }
      
      this.diceBoxInstance = new DiceBox("#dice-preview-box", previewConfig);
      await this.diceBoxInstance.initialize();
      this.diceBoxInstance.roll("1d6"); // Einen Würfel zur Vorschau rollen

    } catch (e) {
      console.error("Fehler beim Initialisieren der DiceBox-Vorschau:", e);
      this.isDiceBoxInitialized = false; // Zurücksetzen, damit es erneut versucht werden kann
    }
  }

  private updateDiceBoxPreview(config: any) {
    if (!this.diceBoxInstance) {
      this.initializeDiceBox();
      return;
    }
    
    const configUpdate: any = {
      theme_material: config.theme_material || 'plastic',
      theme_texture: config.theme_texture || 'marble'
    };
    if (config.theme_customColorset) {
      configUpdate.theme_colorset = null;
      configUpdate.theme_customColorset = config.theme_customColorset;
    } else {
      configUpdate.theme_colorset = config.theme_colorset || 'pinkdreams';
      configUpdate.theme_customColorset = null;
    }
    
    this.diceBoxInstance.updateConfig(configUpdate);
    this.rerollPreview(); // Änderung durch Neuwürfeln anzeigen
  }

  rerollPreview() {
    if (this.diceBoxInstance) {
      this.diceBoxInstance.roll("1d6");
    }
  }
}