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

		const assets = AssetLoader.assets.models;
		if (this.entityType === EntityType.FACTORY) {
			this._model = assets.FACTORY.model.scene.clone();
			this._offset = [0, 3, 0];
		} else if (this.entityType === EntityType.FACTORY_EXTENSION) {
			this._model = assets.FACTORY_EXTENSION.model.scene.clone();
			this._offset = [0, 3, 0];
		} else if (this.entityType === EntityType.CACAOTREE) {
			this._model = assets.CACAOTREE.model.scene.clone();
			this._offset = [1, 2, 1.5];
		} else if (this.entityType === EntityType.RUM_TRUFFLE_CANNON) {
			this._model = assets.RUM_TRUFFLE_CANNON.model.scene.clone();
			this._offset = [2, 4, 1.5];
		} else if (this.entityType === EntityType.CREAM) {
			this._model = assets.CREAM.model.scene.clone();
			this._model.scale.set(3, 3, 3);
			this._offset = [0, 0, 0];
		} else if (this.entityType === EntityType.SPYING_EASTER_BUNNY) {
			this._model = assets.SPYING_EASTER_BUNNY.model.scene.clone();
			this._model.scale.set(3, 3, 3);
			this._offset = [1, 2, 1.5];
		} else if (this.entityType === EntityType.XMAS_FACTORY) {
			this._model = assets.XMAS_FACTORY.model.scene.clone();
			this._offset = [0, 0, 0];
		} else if (this.entityType === EntityType.HOT_CHOCOLATE_BALISTA) {
			this._model = assets.HOT_CHOCOLATE_BALISTA.model.scene.clone();
			this._offset = [1, 2, 1.5];
		} else if (this.entityType === EntityType.CHOCOLATE_FOUNTAIN) {
			this._model = assets.CHOCOLATE_FOUNTAIN.model.scene.clone();
			this._offset = [1, 2, 1.5];
		} else if (this.entityType === EntityType.FRUIT_CANNON) {
			this._model = assets.FRUIT_CANNON.model.scene.clone();
			this._offset = [1, 2, 1.5];
		}
	}

	explode() {
		const assets = AssetLoader.assets.models;
		if (this.entityType === EntityType.CACAOTREE) {
			this._model = assets.CACAOTREE_EXPLOSION.model.scene.clone();
		} else if (this.entityType === EntityType.FACTORY) {
			this._model = assets.FACTORY_EXPLOSION.model.scene.clone();
		} else if (this.entityType === EntityType.RUM_TRUFFLE_CANNON) {
			this._model = assets.RUM_TRUFFLE_CANNON_EXPLOSION.model.scene.clone();
		} else if (this.entityType === EntityType.SPYING_EASTER_BUNNY) {
			this._model = assets.SPYING_EASTER_BUNNY_EXPLOSION.model.scene.clone();
			this._model.scale.set(3, 3, 3);
		} else {
			this._model = assets.CREAM_EXPLOSION.model.scene.clone();
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
		this._model.children[0].material = new THREE.MeshBasicMaterial({ opacity: 0.6, transparent: true });
	}

	makeCreamy() {
		const assets = AssetLoader.assets.models;
		let creamAround = assets.CREAM_AROUND_BUILDING.model.scene.clone();
		creamAround.traverse(child => {
			if (child instanceof THREE.Mesh) {
				child.material.opacity = 0.8;
				child.material.transparent = true;
			}
		});

		creamAround.position.x -= this._offset[0];
		creamAround.position.y -= this._offset[1];
		creamAround.position.z -= this._offset[2];
		creamAround.rotation.y = -this._model.rotation.y;
		this._model.add(creamAround);
	}

	getModel() {
		return this._model;
	}
}

export default Building;