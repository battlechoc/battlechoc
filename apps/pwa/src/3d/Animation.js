import { AnimationMixer, LoopOnce } from 'three';

export default class Animation {
	constructor(gamefield, turned, asset, position, id, onFinished) {
		this.animation = asset.model;
		this.gamefield = gamefield;
		this.onFinished = onFinished;

		this.model = this.animation.scene.clone();
        this.model.position.set(position.x, position.y, position.z);
        if (turned) {
        	this.model.rotation.y = Math.PI;
        }

        this.mixer = new AnimationMixer(this.model);
        this.subanimations = this.animation.animations;
        this.subanimation = 0;
        this.id = id;
	}

	play(offset=25) {
		this.gamefield.add(this.model);
		setTimeout(() => {
	        for (let i = 0; i < this.subanimations.length; i++) {
	            this.mixer.clipAction(this.subanimations[i]).setLoop(LoopOnce).play();
	        }
    	}, offset);
        this.mixer.addEventListener('finished', () => this.callback());
	}

	callback = () => {
	    this.subanimation++;
        if (this.subanimation === this.subanimations.length) {
        	this.mixer.stopAllAction();
            this.gamefield.remove(this.model);
            this.onFinished();
        }
	}
}