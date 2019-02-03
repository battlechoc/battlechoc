import * as THREE from 'three';

export default class BillboardAnimation {
    constructor(spritesheet, frames) {
        this.frames = frames;
        this.frame = this.frames;
        var texture = new THREE.TextureLoader().load(spritesheet);
        this.material = new THREE.SpriteMaterial({ 
            map: texture, 
            side:THREE.DoubleSide, 
            transparent: true 
        });
        this.material.map.repeat = new THREE.Vector2(1 / this.frames, 1);
        this.material.map.offset = new THREE.Vector2((1 / this.frames) * this.frame, 0);
        this.material.depthTest = false;
        this.sprite = new THREE.Sprite(this.material);
        this.sprite.position.set(-15, 0, 0);
        this.sprite.scale.set(50, 50, 1.0);
        this.isPlaying = false;
    }

    playAt(position) {
        this.sprite.position.set(position.x + 72, position.y + 50, position.z);
        this.play();
    }

    play() {
        this.isPlaying = true;
        this.frame = 0;
    }

    animate() {
        if (this.frame < this.frames && this.isPlaying) {
            this.frame += 1;
            this.material.map.offset = new THREE.Vector2((1 / this.frames) * this.frame, 0);
        }
    }
}