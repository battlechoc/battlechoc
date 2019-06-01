import { assetLoader as AssetLoader } from '../AssetLoader.js';
import { Mesh, MeshLambertMaterial, SpotLight } from 'three';
import { EntityType } from '../gameplay/GameEntities'

class Building {
	constructor(entityType, cellIdx, position3d, fieldIdx) {
		if (!EntityType.isInstanceOf(entityType)) {
			throw new Error(entityType + ' is not instance of EntityType');
		}

		this.entityType = entityType;
		this._cellIdx = cellIdx;
		this._fieldIdx = fieldIdx;
		this._creamy = false;
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
			shield.material = new MeshLambertMaterial({ color: 0x6C5710, opacity: 0.3, transparent: true });
		} else if (this.entityType === EntityType.FRUIT_CANNON) {
			this._model = assets.FRUIT_CANNON.model.scene.clone();
		}

		if (typeof this._model !== 'undefined') {
			this._model.position.set(position3d.x, position3d.y, position3d.z);
			this._model.traverse(child => {
				if (child instanceof Mesh) {
					if (child.name !== 'Shield') {
						child._cellIdx = this._cellIdx;
						child._fieldIdx = this._fieldIdx;
					}
				}
			});
		}
	}

	show() {
		this._model.traverse(child => {
			if (child instanceof Mesh) {
				child.visible = true;
			}
		});
	}

	hide() {
		this._model.traverse(child => {
			if (child instanceof Mesh) {
				child.visible = false;
			}
		});
	}

	highlight(unhighlight) {
		var highlighted = false;
		let spotlight = undefined;
		this._model.traverse(child => {
			if (child instanceof SpotLight) {
				spotlight = child;
				highlighted = true;
			}
		});

		if (unhighlight === true && highlighted === true) {
			if (this._creamy === true) {
				this._showCream();
			}
			this._model.remove(spotlight);
		} else if (unhighlight !== true && highlighted === false) {
			if (this._creamy === true) {
				this._hideCream();
			}
			spotlight = new SpotLight(0xffffff, 4.0, 64, 0.2);
			spotlight.position.set(0, 32, 0);
			spotlight.target = this._model;
			this._model.add(spotlight);
		}
	}

	rotate(rad) {
		this._model.rotation.y = rad;
	}

	_cream() {
		const assets = AssetLoader.assets.models;
		let creamAround = assets.CREAM_AROUND_BUILDING.model.scene.clone();
		creamAround.name = 'CREAMY_FIELD';
		this._model.add(creamAround);
	}

	makeCreamy() {
		this._creamy = true;
		this._cream();
	}

	_uncream() {
		let creamyField = this._model.getObjectByName('CREAMY_FIELD');
		this._model.remove(creamyField);
	}

	_hideCream() {
		let creamyField = this._model.getObjectByName('CREAMY_FIELD');
		if (creamyField) {
			creamyField.traverse(child => {
				if (child instanceof Mesh) {
					child.visible = false;
				}
			});
		}
	}

	_showCream() {
		let creamyField = this._model.getObjectByName('CREAMY_FIELD');
		if (creamyField) {
			creamyField.traverse(child => {
				if (child instanceof Mesh) {
					child.visible = true;
				}
			});
		}
	}

	makeUncreamy() {
		this._creamy = false;
		this._uncream();
	}
}

export default Building;