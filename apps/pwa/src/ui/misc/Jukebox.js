import { useState, useEffect } from "react";
import logger from "../../helper/logger.js";
import OfflineStore from "../../OfflineStore.js";
import { AudioClip } from "./audioClip.js";

class Jukebox {
  constructor() {
    this.isMuted = false;
    // the settings' levels (0 to 1) and the click of the buttons, kept in OfflineStore "audio"
    this.musicVolume = 1;
    this.soundVolume = 1;
    this.clicks = true;
    this.listeners = new Set();
    this.buffer = [];
    this.SOUNDS = Object.freeze({
      UI_ACCEPT: { filename: "/sound/ui_accept.mp3", sound: null, click: true },
      UI_BUILD: { filename: "/sound/ui_build.mp3", sound: null },
      ATTACK_EXPLOSION: {
        filename: "/sound/attack_explosion.mp3",
        sound: null,
      },
      ATTACK_BUNNY: { filename: "/sound/attack_bunny.mp3", sound: null },
      BUNNY_CAUGHT: { filename: "/sound/bunny_caught.mp3", sound: null },
    });

    this.SONGS = Object.freeze({
      MAIN_THEME: { filename: "/music/CacaoLiving.mp3", music: null },
    });

    this.soundContext = new (window.AudioContext ||
      window.webkitAudioContext)();
    this.musicContext = new (window.AudioContext ||
      window.webkitAudioContext)();
    // every sound and song plays through the volume of its kind
    this.soundOutput = this.soundContext.createGain();
    this.soundOutput.connect(this.soundContext.destination);
    this.musicOutput = this.musicContext.createGain();
    this.musicOutput.connect(this.musicContext.destination);

    // only the click loads at once; the music (2.5 MB) and the match sounds wait for the 3D
    // models (loadDeferred), so they do not slow down the first start
    Object.keys(this.SOUNDS).forEach((sound) => {
      this.SOUNDS[sound].sound = new AudioClip(this.soundOutput, this.SOUNDS[sound].filename, false, {
        deferred: !this.SOUNDS[sound].click,
      });
    });
    Object.keys(this.SONGS).forEach((song) => {
      this.SONGS[song].music = new AudioClip(this.musicOutput, this.SONGS[song].filename, true, {
        deferred: true,
      });
    });

    // the music and the match sounds have been asked for (loadDeferred); muted, they wait
    this.deferredWanted = false;
    this.settingsLoaded = OfflineStore.settingsStore.get("audio").then((audioSettings) => {
      if (typeof audioSettings !== "undefined") {
        this.musicVolume = audioSettings.musicVolume ?? 1;
        this.soundVolume = audioSettings.soundVolume ?? 1;
        this.clicks = audioSettings.clicks ?? true;
        this.applyVolumes();
        this.mute(!audioSettings.sfxMuted);
      }
    });
  }

  settings() {
    return {
      muted: this.isMuted,
      musicVolume: this.musicVolume,
      soundVolume: this.soundVolume,
      clicks: this.clicks,
    };
  }

  /** Calls the listener with settings() on every change; returns the unsubscribe. */
  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  changed() {
    OfflineStore.settingsStore
      .set("audio", {
        musicMuted: this.isMuted,
        sfxMuted: this.isMuted,
        musicVolume: this.musicVolume,
        soundVolume: this.soundVolume,
        clicks: this.clicks,
      })
      .catch((err) => {
        logger.warn("Could not persist audio settings. ", err);
      });
    const settings = this.settings();
    this.listeners.forEach((listener) => listener(settings));
  }

  // the ear hears loudness about logarithmically: the square makes the middle of the slider
  // sound like half
  applyVolumes() {
    this.musicOutput.gain.value = this.musicVolume * this.musicVolume;
    this.soundOutput.gain.value = this.soundVolume * this.soundVolume;
  }

  setMusicVolume(volume) {
    this.musicVolume = volume;
    this.applyVolumes();
    this.changed();
  }

  setSoundVolume(volume) {
    this.soundVolume = volume;
    this.applyVolumes();
    this.changed();
  }

  setClicks(clicks) {
    this.clicks = clicks;
    this.changed();
  }

  /**
   * Loads the music and the match sounds (after the 3D models of the first start, App) when the
   * sound is on. Muted, nothing is fetched or decoded (the song alone is 2.5 MB, some 30 MB once
   * decoded) until the player switches the sound on.
   */
  loadDeferred() {
    this.deferredWanted = true;
    this.settingsLoaded.then(() => {
      if (!this.isMuted) {
        this.loadClips();
      }
    });
  }

  loadClips() {
    const clips = [
      ...Object.values(this.SOUNDS).map((entry) => entry.sound),
      ...Object.values(this.SONGS).map((entry) => entry.music),
    ];
    clips.forEach((clip) => clip.load().catch((error) => logger.warn("Audio was unable to load: " + error)));
  }

  startMusic(song) {
    this.music = song.music;
    this.playMusic();
  }

  playMusic() {
    if (typeof this.music !== "undefined" && !this.isMuted) {
      this.music.play();
    }
  }

  pauseMusic() {
    if (typeof this.music !== "undefined") {
      this.music.stop();
    }
  }

  stopMusic() {
    if (typeof this.music !== "undefined") {
      this.music.stop();
      this.music = undefined;
    }
  }

  mute(unmute) {
    const oldMuteState = this.isMuted;
    if (unmute === true) {
      this.isMuted = false;
    } else {
      this.isMuted = true;
    }

    this.changed();

    if (this.isMuted !== oldMuteState) {
      if (this.isMuted) {
        this.pauseMusic();
        if (this.musicContext.state === "running") {
          this.musicContext.suspend();
        }
        if (this.soundContext.state === "running") {
          this.soundContext.suspend();
        }
      } else {
        // the sound is on: what waited for it loads now (a song asked to play starts once it is in)
        if (this.deferredWanted) {
          this.loadClips();
        }
        if (this.musicContext.state === "suspended") {
          this.musicContext.resume().then(() => this.playMusic());
        } else {
          this.playMusic();
        }
        this.soundContext.resume();
      }
    }
  }

  toggleMute() {
    this.mute(this.isMuted);
  }

  playSound(sound) {
    if (!this.isMuted && (this.clicks || !sound.click)) {
      sound.sound.play();
    }
  }
}

const jukebox = new Jukebox();

/** The audio settings of the Jukebox, kept current. */
const useAudioSettings = () => {
  const [settings, setSettings] = useState(() => jukebox.settings());
  useEffect(() => {
    setSettings(jukebox.settings());
    return jukebox.onChange(setSettings);
  }, []);
  return settings;
};

export { useAudioSettings };
export default jukebox;
