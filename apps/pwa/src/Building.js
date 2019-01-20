import GLTFLoader from 'three-gltf-loader';

const BuildingType = Object.freeze({
	EMPTY: Symbol("empty"), 
    FACTORY:   Symbol("factory"),
    CACAOTREE:  Symbol("cacaotree"),
    RUM_TRUFFLE_CANNON: Symbol("rumTruffleCannon"),
    isInstanceOf: function (buildingType) {
    	if (buildingType === BuildingType.EMPTY ||
    		buildingType === BuildingType.FACTORY ||
    		buildingType === BuildingType.CACAOTREE ||
    		buildingType === BuildingType.RUM_TRUFFLE_CANNON)
    		return true;
    	else
    		return false; 
    }
});

function loadGLTFModel(filename) {
	var loader = new GLTFLoader();
	return new Promise((resolve, reject) => {
	  	loader.load(filename, resolve);
	});
}

var buildingModels = undefined;
(async () => {
	return [
		await loadGLTFModel('models/factory.gltf'),
		await loadGLTFModel('models/cacaotree.gltf'),
		await loadGLTFModel('models/cannon.gltf')
	]
})().then(models => buildingModels = models);

class Building {
	constructor(buildingType) {
		if (BuildingType.isInstanceOf(buildingType)) {
			this._buildingType = buildingType;
		} else {
			throw new Error(buildingType + ' is not instance of BuildingType');
		}

		if (this._buildingType === BuildingType.FACTORY) {
			this._model = buildingModels[0].scene.clone();
			this._offset = [1.5, 6, 1.5];
		} else if (this._buildingType === BuildingType.CACAOTREE) {
			this._model = buildingModels[1].scene.clone();
			this._offset = [3, 6, 3.5];
		} else if (this._buildingType === BuildingType.RUM_TRUFFLE_CANNON) {
			this._model = buildingModels[2].scene.clone();
			this._offset = [3, 6, 2.5];
		}
	}

	adjustPosition(fieldPosition, position) {
		this._model.position.set(
			position[0] + fieldPosition.x + this._offset[0],
			position[1] + fieldPosition.y + this._offset[1],
			position[2] + fieldPosition.z + this._offset[2],
		);		
	}

	adjustRotation() {
		if (this._buildingType === BuildingType.RUM_TRUFFLE_CANNON) {
			this._model.rotation.y = Math.PI * -(1/3);
		}
	}

	getModel() {
		return this._model;
	}
}

export { BuildingType, Building };