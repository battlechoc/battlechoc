import ModelLoader from './ModelLoader.js';
import * as THREE from 'three';

const BuildingType = Object.freeze({
	EMPTY: Symbol('empty'),
	CREAM: Symbol('cream'), 
    FACTORY:   Symbol('factory'),
    CACAOTREE:  Symbol('cacaotree'),
    RUM_TRUFFLE_CANNON: Symbol('rumTruffleCannon'),
    isInstanceOf: function (buildingType) {
    	if (buildingType === BuildingType.EMPTY ||
    		buildingType === BuildingType.CREAM ||
    		buildingType === BuildingType.FACTORY ||
    		buildingType === BuildingType.CACAOTREE ||
    		buildingType === BuildingType.RUM_TRUFFLE_CANNON)
    		return true;
    	else
    		return false; 
    }
});

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
		} else if (this.buildingType === BuildingType.CACAOTREE) {
			this._model = ModelLoader.models[4].scene.clone();
			this._offset = [3, 6, 3.5];
		} else if (this.buildingType === BuildingType.RUM_TRUFFLE_CANNON) {
			this._model = ModelLoader.models[5].scene.clone();
			this._offset = [3, 6, 2.5];
		} else if (this.buildingType === BuildingType.CREAM) {
			this._model = ModelLoader.models[6].scene.clone();
			this._model.scale.set(3,3,3);
			this._offset = [0, 0, 0];
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

	getModelWireframe() {
		this._model.children[2].material = new THREE.MeshBasicMaterial({opacity: 0.2, transparent: true, wireframe: true});
		return this._model;
	}

	getModel() {
		return this._model;
	}
}

export { BuildingType, Building };