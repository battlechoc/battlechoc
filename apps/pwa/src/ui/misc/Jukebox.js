import logger from '../../helper/logger';
import OfflineStore from '../../OfflineStore';

class Jukebox {
    constructor() {
        this.isMuted = false;
        OfflineStore.settingsStore.get('audio').then(audioSettings => {
            if (typeof audioSettings !== 'undefined') {
                this.mute(!audioSettings.sfxMuted);
            }
        });
        this.buffer = [];
        this.SOUNDS = Object.freeze({
            UI_ACCEPT: { filename: '/sound/ui_accept.mp3', sound: null },
            UI_BUILD: { filename: '/sound/ui_build.mp3', sound: null },
            ATTACK_EXPLOSION: { filename: '/sound/attack_explosion.mp3', sound: null },
            ATTACK_BUNNY: { filename: '/sound/attack_bunny.mp3', sound: null },
            BUNNY_CAUGHT: { filename: '/sound/bunny_caught.mp3', sound: null }
        });

        this.SONGS = Object.freeze({
            MAIN_THEME: { filename: '/music/CacaoLiving.mp3', music: null }
        });

        this.soundContext = new (window.AudioContext || window.webkitAudioContext)();
        this.musicContext = new (window.AudioContext || window.webkitAudioContext)();

        Object.keys(this.SOUNDS).forEach(sound => {
            this.SOUNDS[sound].sound = new Audio(this.soundContext, this.SOUNDS[sound].filename, false);
        });
        Object.keys(this.SONGS).forEach(song => {
            this.SONGS[song].music = new Audio(this.musicContext, this.SONGS[song].filename, true);
        });
    }

    startMusic(song) {
        this.music = song.music;
        this.playMusic();
    }

    playMusic() {
        if (typeof this.music !== 'undefined' && !this.isMuted) {
            this.music.play();
        }
    }

    pauseMusic() {
        if (typeof this.music !== 'undefined') {
            this.music.stop();
        }
    }

    stopMusic() {
        if (typeof this.music !== 'undefined') {
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

        OfflineStore.settingsStore.set('audio', { musicMuted: this.isMuted, sfxMuted: this.isMuted }).catch((err) => {
            console.warn('Could not persist audio settings. ', err);
        });

        if (this.isMuted !== oldMuteState) {
            if (this.isMuted) {
                this.pauseMusic();
                if (this.musicContext.state === 'running') {
                    this.musicContext.suspend()
                }
                if (this.soundContext.state === 'running') {
                    this.soundContext.suspend()
                }
            } else {
                if (this.musicContext.state === 'suspended') {
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
        if (!this.isMuted) {
            sound.sound.play();
        }
    }
}

class Audio {
    constructor(context, url, loop) {
        this.context = context;
        this.url = url;
        this.loop = loop;
        this.offset = 0;
        this.load().catch(error => logger.warn('Audio was unable to load: ' + error));
    }

    load() {
        return new Promise((resolve, reject) => {
            let xhr = new XMLHttpRequest();
            xhr.open('get', this.url, true);
            xhr.responseType = 'arraybuffer';
            xhr.onload = () => {
                this.context.decodeAudioData(xhr.response, (buffer) => {
                    this.buffer = buffer;
                    resolve();
                });
            };
            xhr.onerror = () => reject({ status: xhr.status, statusText: xhr.statusText });
            xhr.send();
        });
    }

    play() {
        if (typeof this.buffer !== 'undefined') {
            if (this.loop) {
                if (typeof this.source !== 'undefined') {
                    try {
                        this.source.stop();
                    } catch (error) {
                        logger.info(error);
                    }
                }
                this.source = this.context.createBufferSource();
                this.source.buffer = this.buffer;
                this.source.connect(this.context.destination);
                this.source.loop = true;
                this.source.start(this.context.currentTime, this.offset % Math.floor(this.buffer.duration));
            } else {
                let source = this.context.createBufferSource();
                source.buffer = this.buffer;
                source.connect(this.context.destination);
                source.onended = () => source.disconnect();
                source.start();
            }
        }
    }

    stop(reset = false) {
        if (typeof this.source !== 'undefined') {
            if (this.loop && !reset) {
                this.offset = this.context.currentTime;
            } else if (this.loop && reset) {
                this.offset = 0;
            }
            try {
                this.source.stop();
            } catch (error) {
                logger.info(error);
            }
        }
    }
}

const jukebox = new Jukebox();
export default jukebox;