import * as THREE from 'three';
import GLTFLoader from 'three-gltf-loader';
import { BuildingType, Building } from './Building.js';

class Gamefield {
	constructor(isPlayerGameField, position) {
		this.isPlayerGameField = isPlayerGameField;
		this.rows = 8;
		this.cols = 8;
		this.fieldSize = 8;
		this.position = position;

		this.buildings = [...Array(this.rows)].map(
			field => Array(this.cols).fill(BuildingType.EMPTY)
		);

		this.loader = new GLTFLoader();
    	this._build();
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
	        	
	        	var fieldClone = undefined;
	        	var fieldtype = fieldtypes[Math.floor(Math.random()*fieldtypes.length)];
	        	if (fieldtype === 'white') {
	          		fieldClone = whiteTileModel.scene.clone();
	        	} else if (fieldtype === 'brown') {
	          		fieldClone = brownTileModel.scene.clone();
	        	} else {
	          		fieldClone = blackTileModel.scene.clone();
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

	setBuilding(scene, position, buildingType) {
		let row = position.x / this.fieldSize;
		let col = position.z / this.fieldSize;
		
		if (this.buildings[row][col] === BuildingType.EMPTY) {
			let building = new Building(buildingType);
			building.adjustPosition(position, this.position);
			building.adjustRotation()
			scene.add(building.getModel());
			this.buildings[row][col] = building;
			return true;
		} else {
			return false;
		}
	}
}

export default Gamefield;