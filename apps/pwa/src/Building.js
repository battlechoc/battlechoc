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

	adjustRotation() {
		if (this.buildingType === BuildingType.RUM_TRUFFLE_CANNON) {
			this._model.rotation.y = Math.PI * -(1/3);
		}
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

	getModelWireframe() {
		this._model.children[2].material = new THREE.MeshBasicMaterial({opacity: 0.2, transparent: true, wireframe: true});
		return this._model;
	}

	getModel() {
		return this._model;
	}
}

export default Building;