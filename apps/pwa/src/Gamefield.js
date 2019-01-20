import * as THREE from 'three';
import GLTFLoader from 'three-gltf-loader';

const Buildings = Object.freeze({
	EMPTY: Symbol("empty"), 
    FACTORY:   Symbol("factory"),
    CACAOTREE:  Symbol("cacaotree"),
    RUM_TRUFFLE_CANNON: Symbol("rumTruffleCannon")
});

class Gamefield {
	constructor(isPlayerGameField, position) {
		this.isPlayerGameField = isPlayerGameField;
		this.rows = 8;
		this.cols = 8;
		this.fieldSize = 8;
		this.position = position;

		this.buildings = [...Array(this.rows)].map(
			field => Array(this.cols).fill(Buildings.EMPTY)
		);

		this.loader = new GLTFLoader();
    	this._build();
    	this._loadBuildings();
	}

	loadGLTFModel(filename) {
		return new Promise((resolve, reject) => {
	  		this.loader.load(filename, resolve);
		});
	}

	getMeshGroup() {
		return this.gameField;
	}

	async _build() {
		this.gameField = new THREE.Group();

		const whiteTileModel = await this.loadGLTFModel('models/white_tile.gltf');
    	const brownTileModel = await this.loadGLTFModel('models/brown_tile.gltf');
    	const blackTileModel = await this.loadGLTFModel('models/black_tile.gltf');

	    var fieldtypes = ['white', 'brown', 'black'];
	    for (let i = 0; i < this.rows; i++) {
	      	for (let j = 0; j < this.cols; j++) {
	        	
	        	var fieldtype = fieldtypes[Math.floor(Math.random()*fieldtypes.length)];
	        	if (fieldtype === 'white') {
	          		var fieldClone = whiteTileModel.scene.clone();
	        	} else if (fieldtype === 'brown') {
	          		var fieldClone = brownTileModel.scene.clone();
	        	} else {
	          		var fieldClone = blackTileModel.scene.clone();
	        	}
	        	
	        	var field = fieldClone.children[2]
	        	field.scale.set(3, 3, 3);
	        	field.position.set(this.fieldSize * i, 0, this.fieldSize * j);
	        	
	        	this.gameField.add(field);
	      	}
	    }

	    this.gameField.position.set(this.position[0], this.position[1], this.position[2]);
	}

	getClickableFields() {
		return this.gameField.children;
	}

	setFactory(scene, position) {
		let row = position.x / this.fieldSize;
		let col = position.z / this.fieldSize;
		
		if (this.buildings[row][col] == Buildings.EMPTY) {
			let factory = this.factoryModel.scene.clone();
			factory.position.set(position.x - 70.5, -10, position.z + 1.5);
			scene.add(factory);
			this.buildings[row][col] = Buildings.FACTORY;
			return true;
		} else {
			return false;
		}
	}

	setCacaotree(scene, position) {
		let row = position.x / this.fieldSize;
		let col = position.z / this.fieldSize;

		if (this.buildings[row][col] == Buildings.EMPTY) {
			let cacaotree = this.cacaotreeModel.scene.clone();
			cacaotree.position.set(position.x - 69, -10, position.z + 3.5);
			scene.add(cacaotree);
			this.buildings[row][col] = Buildings.CACAOTREE;
			return true;
		} else {
			return false;
		}
	}

	async _loadBuildings() {
		this.cannonModel = await this.loadGLTFModel('models/cannon.gltf');
    	this.factoryModel = await this.loadGLTFModel('models/factory.gltf');
    	this.cacaotreeModel = await this.loadGLTFModel('models/cacaotree.gltf');
	}

	setRumTruffleCannon(scene, position) {
		let row = position.x / this.fieldSize;
		let col = position.z / this.fieldSize;

		if (this.buildings[row][col] == Buildings.EMPTY) {
			let cannon = this.cannonModel.scene.clone();
			cannon.rotation.y = Math.PI * -(1/3)
			cannon.position.set(position.x - 69, -10, position.z + 2.5);
			scene.add(cannon);
			this.buildings[row][col] = Buildings.RUM_TRUFFLE_CANNON;
			return true;
		} else {
			return false;
		}
	}

}

export default Gamefield;