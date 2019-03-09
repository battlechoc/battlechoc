import AssetLoader from './AssetLoader.js';
import * as THREE from 'three';
import { EntityType } from './gameplay/GameEntities'

class Building {
	constructor(entityType) {
		if (EntityType.isInstanceOf(entityType)) {
			this.entityType = entityType;
		} else {
			throw new Error(entityType + ' is not instance of EntityType');
		}

		if (this.entityType === EntityType.FACTORY) {
			this._model = AssetLoader.models[3].scene.clone();
			this._offset = [0, 3, 0];
		} else if (this.entityType === EntityType.FACTORY_EXTENSION) {
			this._model = AssetLoader.models[4].scene.clone();
			this._offset = [0, 3, 0];
		} else if (this.entityType === EntityType.CACAOTREE) {
			this._model = AssetLoader.models[5].scene.clone();
			this._offset = [1, 2, 1.5];
		} else if (this.entityType === EntityType.RUM_TRUFFLE_CANNON) {
			this._model = AssetLoader.models[6].scene.clone();
			this._offset = [2, 4, 1.5];
		} else if (this.entityType === EntityType.CREAM) {
			this._model = AssetLoader.models[7].scene.clone();
			this._model.scale.set(3, 3, 3);
			this._offset = [0, 0, 0];
		} else if (this.entityType === EntityType.EASTER_FACTORY) {
			this._model = AssetLoader.models[5].scene.clone();
			this._offset = [1, 2, 1.5];
		} else if (this.entityType === EntityType.XMAS_FACTORY) {
			this._model = AssetLoader.models[5].scene.clone();
			this._offset = [1, 2, 1.5];
		} else if (this.entityType === EntityType.HOT_CHOCOLATE_BALISTA) {
			this._model = AssetLoader.models[5].scene.clone();
			this._offset = [1, 2, 1.5];
		} else if (this.entityType === EntityType.CHOCOLATE_FOUNTAIN) {
			this._model = AssetLoader.models[5].scene.clone();
			this._offset = [1, 2, 1.5];
		} else if (this.entityType === EntityType.FRUIT_CANNON) {
			this._model = AssetLoader.models[5].scene.clone();
			this._offset = [1, 2, 1.5];
		}
	}

	explode() {
		if (this.entityType === EntityType.CACAOTREE) {
			this._model = AssetLoader.models[9].scene.clone();
		} else if (this.entityType === EntityType.FACTORY) {
			this._model = AssetLoader.models[10].scene.clone();
		} else if (this.entityType === EntityType.RUM_TRUFFLE_CANNON) {
			this._model = AssetLoader.models[11].scene.clone();
		} else {
			this._model = AssetLoader.models[8].scene.clone();
			this._model.scale.set(3, 3, 3);
		}
	}

	adjustPosition(position) {
		this._model.position.set(
			position.x + this._offset[0],
			position.y + this._offset[1],
			position.z + this._offset[2],
		);
	}

	show() {
		this._model.traverse(child => {
			if (child instanceof THREE.Mesh) {
				child.visible = true;
			}
		});

	}

	hide() {
		this._model.traverse(child => {
			if (child instanceof THREE.Mesh) {
				child.visible = false;
			}
		});
	}

	rotate(rad) {
		this._model.rotation.y = rad;
	}

	makeTransparent() {
		this._model.children[2].material = new THREE.MeshBasicMaterial({ opacity: 0.6, transparent: true });
	}

	makeCreamy() {
		let creamAround = AssetLoader.models[12].scene.clone();
		creamAround.traverse(child => {
			if (child instanceof THREE.Mesh) {
				child.material.opacity = 0.8;
				child.material.transparent = true;
			}
		});
		this._model.traverse(child => {
			if (child instanceof THREE.Mesh) {
				child.renderOrder = 2;
			}
		});

		creamAround.position.x -= this._offset[0];
		creamAround.position.y -= this._offset[1];
		creamAround.position.z -= this._offset[2];
		creamAround.rotation.y = -this._model.rotation.y;
		this._model.add(creamAround);
		console.log(this._model);

	}

	getModel() {
		return this._model;
	}
}

export default Building;