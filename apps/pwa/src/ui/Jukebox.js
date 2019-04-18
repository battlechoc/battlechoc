class Jukebox {
	constructor() {
		this.mute = false;
		this.SOUNDS = Object.freeze({
		    UI_ACCEPT: 'sound/ui_accept.mp3',
		    UI_BUILD: 'sound/ui_build.mp3',
		    ATTACK_EXPLOSION: 'sound/attack_explosion.mp3',
		    ATTACK_BUNNY: 'sound/attack_bunny.mp3',
		    BUNNY_CAUGHT: 'sound/bunny_caught.mp3'
		});

		this.SONGS = Object.freeze({
		    MAIN_THEME: 'music/CacaoLiving.mp3'
		});
	}

	startMusic(song) {
		this.music = new Audio(song);
		this.music.volume = 0.8;
		this.music.loop = true;
		this.playMusic();
	}

	playMusic() {
		if (typeof this.music !== 'undefined' && !this.mute) {
			this.music.play();
		}		
	}

	pauseMusic() {
		if (typeof this.music !== 'undefined') {
			this.music.pause();
		}
	}

	stopMusic() {
		if (typeof this.music !== 'undefined') {
			this.music.pause();
			this.music = undefined;
		}
	}

	toggleMute() {
		this.mute = !this.mute;
		if (this.mute) {
			this.pauseMusic();
		} else {
			this.playMusic();
		}
	}

	playSound(sound) {
		if (!this.mute) {
			let audio = new Audio(sound);
			audio.volume = 1;

			if (sound === this.SOUNDS.UI_ACCEPT) {
				audio.volume = 0.2;
			}

		    audio.play();
		}
	}
}

const jukebox = new Jukebox();
export default jukebox;