import ModelLoader from './ModelLoader.js';
import * as THREE from 'three';
import { BuildingType } from './gameplay/GameEntities'

class Building {
	constructor(buildingType) {
		if (BuildingType.isInstanceOf(buildingType)) {
			this.buildingType = buildingType;
		} else {
			throw new Error(buildingType + ' is not instance of BuildingType');
		}

		if (this.buildingType === BuildingType.FACTORY) {
			this._model = ModelLoader.models[3].scene.clone();
			this._offset = [1.5, 6, 1.5];
		} else if (this.buildingType === BuildingType.FACTORY_EXTENSION) {
			this._model = ModelLoader.models[4].scene.clone();
			this._offset = [1.5, 6, 1.5];
		} else if (this.buildingType === BuildingType.CACAOTREE) {
			this._model = ModelLoader.models[5].scene.clone();
			this._offset = [3, 6, 3.5];
		} else if (this.buildingType === BuildingType.RUM_TRUFFLE_CANNON) {
			this._model = ModelLoader.models[6].scene.clone();
			this._offset = [3, 6, 2.5];
		} else if (this.buildingType === BuildingType.CREAM) {
			this._model = ModelLoader.models[7].scene.clone();
			this._model.scale.set(3,3,3);
			this._offset = [0, 0, 0];
		}
	}

	explode() {
		if (this.buildingType === BuildingType.CACAOTREE) {
			this._model = ModelLoader.models[9].scene.clone();	
		} else if (this.buildingType === BuildingType.FACTORY) {
			this._model = ModelLoader.models[10].scene.clone();
		} else if (this.buildingType === BuildingType.RUM_TRUFFLE_CANNON) {
			this._model = ModelLoader.models[11].scene.clone();
		} else {
			this._model = ModelLoader.models[8].scene.clone();
			this._model.scale.set(3,3,3);
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
		this._model.children[2].material = new THREE.MeshBasicMaterial({opacity: 0.6, transparent: true});
	}

	makeCreamy() {
		let creamAround = ModelLoader.models[12].scene.clone();
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

		this._model.add(creamAround);
	}

	getModel() {
		return this._model;
	}
}

export default Building;