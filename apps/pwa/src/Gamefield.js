import * as THREE from 'three';
import { BuildingType, Building } from './Building.js';
import ModelLoader from './ModelLoader.js'

class Gamefield {
	constructor(isPlayerGameField, position, scene) {
		this.isPlayerGameField = isPlayerGameField;
		this.scene = scene;
		this.rows = 8;
		this.cols = 8;
		this.fieldSize = 8;
		this.position = position;

		this.buildings = [...Array(this.rows)].map(
			field => Array(this.cols).fill(BuildingType.EMPTY)
		);

    	this._build();
    	this.addRandomCream(20);
    	this.scene.add(this.gameField);
	}

	addRandomCream(count) {
		if(this.isPlayerGameField) {
			for (let i = 0; i < count; i++) {
				let randomCol = Math.floor(Math.random() * 8);
				let randomRow = Math.floor(Math.random() * 8);
				let position = {
					x: randomRow * this.fieldSize,
					y: 0,
					z: randomCol * this.fieldSize
				}
				let buildingType = BuildingType.CREAM;
				let building = new Building(buildingType);
				building.adjustPosition(position, this.position);
				this.scene.add(building.getModel());
				this.buildings[randomRow][randomCol] = building;
				console.log(randomRow, randomCol)
			}
		}
	}

	async _build() {
		this.gameField = new THREE.Group();
	    var fieldtypes = ['white', 'brown', 'black'];
	    for (let i = 0; i < this.rows; i++) {
	      	for (let j = 0; j < this.cols; j++) {
	        	
	        	var fieldClone = undefined;
	        	var fieldtype = fieldtypes[Math.floor(Math.random()*fieldtypes.length)];
	        	if (fieldtype === 'white') {
	          		fieldClone = ModelLoader.models[0].scene.clone();
	        	} else if (fieldtype === 'brown') {
	          		fieldClone = ModelLoader.models[1].scene.clone();
	        	} else {
	          		fieldClone = ModelLoader.models[2].scene.clone();
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

	setBuilding(position, buildingType) {
		let row = position.x / this.fieldSize;
		let col = position.z / this.fieldSize;
		
		if (this.buildings[row][col] === BuildingType.EMPTY || this.buildings[row][col] === BuildingType.CREAM) {
			let building = new Building(buildingType);
			building.adjustPosition(position, this.position);
			building.adjustRotation()
			this.scene.add(building.getModel());
			this.buildings[row][col] = building;
			return true;
		} else {
			return false;
		}
	}
}

export default Gamefield;