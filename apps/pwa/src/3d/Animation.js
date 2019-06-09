import { AnimationMixer, LoopOnce } from 'three';
import { assetLoader as AssetLoader} from '../AssetLoader.js';
import { EntityType } from '../gameplay/GameEntities';

export default class Animation {
	constructor(gamefield, turned, asset, position, id, onFinished) {
		const assets = AssetLoader.assets.models;
		this.animation = assets[asset].model;
		this.gamefield = gamefield;
		this.onFinished = onFinished;
		this.model = this.animation.scene.clone();
        this.model.position.set(position.x, position.y, position.z);
        if (turned) {
        	this.model.rotation.y = Math.PI;
        }

        if (asset === EntityType.CREAM + '.EXPLOSION') {
        	this.model.rotation.y = Math.random() * Math.PI;
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