class Jukebox {
    constructor() {
        this.mute = false;
        this.buffer = [];
        this.SOUNDS = Object.freeze({
            UI_ACCEPT: { filename: 'sound/ui_accept.mp3', sound: null },
            UI_BUILD: { filename: 'sound/ui_build.mp3', sound: null },
            ATTACK_EXPLOSION: { filename: 'sound/attack_explosion.mp3', sound: null },
            ATTACK_BUNNY: { filename: 'sound/attack_bunny.mp3', sound: null },
            BUNNY_CAUGHT: { filename: 'sound/bunny_caught.mp3', sound: null }
        });

        this.SONGS = Object.freeze({
            MAIN_THEME: { filename: 'music/CacaoLiving.mp3', music: null }
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
        if (typeof this.music !== 'undefined' && !this.mute) {
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

    toggleMute() {
        this.mute = !this.mute;
        if (this.mute) {
            this.pauseMusic();
            if(this.musicContext.state === 'running') {
                this.musicContext.suspend()
            }
            if(this.soundContext.state === 'running') {
                this.soundContext.suspend()
            }
        } else {
            if(this.musicContext.state === 'suspended') {
                this.musicContext.resume().then(() => this.playMusic());  
            }else{
                this.playMusic();
            }
            this.soundContext.resume();
        }
    }

    playSound(sound) {
        if (!this.mute) {
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
        this.load().catch(error => console.warn('Audio was unable to load: ' + error));
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
                    this.source.stop();
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

    stop() {
        if (typeof this.source !== 'undefined') {
            if (this.loop) {
                this.offset = this.context.currentTime;
            }
            this.source.stop();
        }
    }
}

const jukebox = new Jukebox();
export default jukebox;