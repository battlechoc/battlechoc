import AssetLoader from './AssetLoader.js';
import * as THREE from 'three';
import { EntityType } from './gameplay/GameEntities'

class Building {
	constructor(entityType, cellIdx, position3d, fieldIdx) {
		if (!EntityType.isInstanceOf(entityType)) {
			throw new Error(entityType + ' is not instance of EntityType');
		}

		this.entityType = entityType;
		this._cellIdx = cellIdx;
		this._fieldIdx = fieldIdx;
		const assets = AssetLoader.assets.models;
		if (this.entityType === EntityType.FACTORY) {
			this._model = assets.FACTORY.model.scene.clone();
		} else if (this.entityType === EntityType.FACTORY_EXTENSION) {
			this._model = assets.FACTORY_EXTENSION.model.scene.clone();
		} else if (this.entityType === EntityType.CACAOTREE) {
			this._model = assets.CACAOTREE.model.scene.clone();
		} else if (this.entityType === EntityType.RUM_TRUFFLE_CANNON) {
			this._model = assets.RUM_TRUFFLE_CANNON.model.scene.clone();
		} else if (this.entityType === EntityType.CREAM) {
			this._model = assets.CREAM.model.scene.clone();
		} else if (this.entityType === EntityType.SPYING_EASTER_BUNNY) {
			this._model = assets.SPYING_EASTER_BUNNY.model.scene.clone();
		} else if (this.entityType === EntityType.XMAS_FACTORY) {
			this._model = assets.XMAS_FACTORY.model.scene.clone();
		} else if (this.entityType === EntityType.HOT_CHOCOLATE_BALLISTA) {
			this._model = assets.HOT_CHOCOLATE_BALLISTA.model.scene.clone();
		} else if (this.entityType === EntityType.CHOCOLATE_FOUNTAIN) {
			this._model = assets.CHOCOLATE_FOUNTAIN.model.scene.clone();
			let shield = this._model.getObjectByName('Shield');
			shield.material = new THREE.MeshLambertMaterial({ color: 0x6C5710, opacity: 0.3, transparent: true });
		} else if (this.entityType === EntityType.FRUIT_CANNON) {
			this._model = assets.FRUIT_CANNON.model.scene.clone();
		}

		if (typeof this._model !== 'undefined') {
			this._model.position.set(position3d.x, position3d.y, position3d.z);
			this._model.traverse(child => {
				if (child instanceof THREE.Mesh) {
					if (child.name !== 'Shield') {
						child._cellIdx = this._cellIdx;
						child._fieldIdx = this._fieldIdx;
					}
				}
			});
		}
	}

	explode() {
		let position = this._model.position;
		const assets = AssetLoader.assets.models;
		if (this.entityType === EntityType.CACAOTREE) {
			this._model = assets.CACAOTREE_EXPLOSION.model.scene.clone();
		} else if (this.entityType === EntityType.FACTORY) {
			this._model = assets.FACTORY_EXPLOSION.model.scene.clone();
		} else if (this.entityType === EntityType.FACTORY_EXTENSION) {
			this._model = assets.FACTORY_EXTENSION_EXPLOSION.model.scene.clone();
		} else if (this.entityType === EntityType.RUM_TRUFFLE_CANNON) {
			this._model = assets.RUM_TRUFFLE_CANNON_EXPLOSION.model.scene.clone();
		} else if (this.entityType === EntityType.SPYING_EASTER_BUNNY) {
			this._model = assets.SPYING_EASTER_BUNNY_EXPLOSION.model.scene.clone();
		} else if (this.entityType === EntityType.XMAS_FACTORY) {
			this._model = assets.XMAS_FACTORY_EXPLOSION.model.scene.clone();
		} else if (this.entityType === EntityType.HOT_CHOCOLATE_BALLISTA) {
			this._model = assets.HOT_CHOCOLATE_BALLISTA_EXPLOSION.model.scene.clone();
		} else if (this.entityType === EntityType.FRUIT_CANNON) {
			this._model = assets.FRUIT_CANNON_EXPLOSION.model.scene.clone();
		} else if (this.entityType === EntityType.CHOCOLATE_FOUNTAIN) {
			this._model = assets.CHOCOLATE_FOUNTAIN_EXPLOSION.model.scene.clone();
		} else {
			this._model = assets.CREAM_EXPLOSION.model.scene.clone();
		}
		this._model.position.set(position.x, position.y, position.z);
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
		this._model.children[0].material = new THREE.MeshBasicMaterial({ opacity: 0.7, transparent: true, depthWrite: false });
	}

	makeCreamy() {
		const assets = AssetLoader.assets.models;
		let creamAround = assets.CREAM_AROUND_BUILDING.model.scene.clone();
		creamAround.traverse(child => {
			if (child instanceof THREE.Mesh) {
				child.material.opacity = 0.8;
				child.material.transparent = true;
				child.renderOrder = -1;
			}
		});

		creamAround.rotation.y = -this._model.rotation.y;
		creamAround.name = 'CREAMY_FIELD';
		this._model.add(creamAround);
	}

	makeUncreamy() {
		let creamyField = this._model.getObjectByName('CREAMY_FIELD');
    	this._model.remove(creamyField);
	}

	getModel() {
		return this._model;
	}
}

export default Building;