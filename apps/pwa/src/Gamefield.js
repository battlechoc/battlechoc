import * as THREE from 'three';
import Building from './Building.js';
import { BuildingType, BoardCellTypes } from './gameplay/GameEntities';
import ModelLoader from './ModelLoader.js';

class Gamefield {
	constructor(isPlayerGameField, position, playerField) {
		this.isPlayerGameField = isPlayerGameField;
		this.rows = 8;
		this.cols = 8;
		this.fieldSize = 8;
		this.position = position;

		this.buildings = [...Array(this.rows)].map(
			field => Array(this.cols).fill(new Building(BuildingType.EMPTY))
		);

		this._build(playerField);
	}

	async _build(playerField) {
		this.gameField = new THREE.Group();
		
		for (let i = 0; i < this.rows; i++) {
			for (let j = 0; j < this.cols; j++) {
				let cell = playerField.grid[i * this.cols + j];
				var fieldClone = undefined;

				if (cell.type === BoardCellTypes.WHITE) {
					fieldClone = ModelLoader.models[0].scene.clone();
				} else if (cell.type === BoardCellTypes.BROWN) {
					fieldClone = ModelLoader.models[1].scene.clone();
				} else if (cell.type === BoardCellTypes.BLACK) {
					fieldClone = ModelLoader.models[2].scene.clone();
				}

				var field = fieldClone.children[2]
				field.scale.set(3, 3, 3);
				field.position.set(this.fieldSize * i, 0, this.fieldSize * j);
                
                this.gameField.add(field);

				if (cell.occupiedBy.includes(BuildingType.CREAM)) {
					this.setBuilding(field.position, BuildingType.CREAM, this.isPlayerGameField);
				}
			}
		}

		this.gameField.position.set(this.position[0], this.position[1], this.position[2]);
	}

	getClickableFields() {
		return this.gameField.children;
	}

	animate(delta) {
    	if (this.mixer) {
        	this.mixer.update(delta);
    	}		
	}

	attack(position) {
		if (typeof this.mixer !== 'undefined') {
			this.mixer.stopAllAction();
			this.explosionCallback();
		}

		let row = position.x / this.fieldSize;
		let col = position.z / this.fieldSize;

		if (this.buildings[row][col].buildingType === BuildingType.CREAM) {
			this.gameField.remove(this.buildings[row][col].getModel());
			this.buildings[row][col].explode();
			
			this.buildings[row][col].adjustPosition(position);
			this.gameField.add(this.buildings[row][col].getModel());

			this.mixer = new THREE.AnimationMixer(this.buildings[row][col].getModel());
			for (let i = 0; i < ModelLoader.models[8].animations.length; i++) {
		    	this.mixer.clipAction(ModelLoader.models[8].animations[i]).setLoop(THREE.LoopOnce).play()
		    }

		    this.explosionCallback = () => {
		    	this.mixer = undefined;
		    	this.gameField.remove(this.buildings[row][col].getModel());
		    	this.buildings[row][col] = new Building(BuildingType.EMPTY);
		    }

		    this.mixer.addEventListener('finished', () => this.explosionCallback());
		}
	}

	getCellIndex(position) {
		return {
			row: position.x / this.fieldSize,
			col: position.z / this.fieldSize
		};
	}
	
	isAboveOfFactory(idx) {
		if ((idx.col + 1) < this.fieldSize) {
			return this.buildings[idx.row][idx.col + 1].buildingType === BuildingType.FACTORY;
		} else {
			return false;
		}
	}

	isRightToFactory(idx) {
		if ((idx.row + 1) < this.fieldSize) {
			return this.buildings[idx.row + 1][idx.col].buildingType === BuildingType.FACTORY;
		} else {
			return false;
		}
	}

	isBelowOfFactory(idx) {
		if ((idx.col - 1) >= 0) {
			return this.buildings[idx.row][idx.col - 1].buildingType === BuildingType.FACTORY;
		} else {
			return false
		}
	}

	isLeftToFactory(idx) {
		if ((idx.row - 1) >= 0) {
			return this.buildings[idx.row - 1][idx.col].buildingType === BuildingType.FACTORY;
		} else {
			return false;
		}
	}

	setBuilding(position, buildingType, asWireframe) {
		if (typeof asWireframe == 'undefined') {
			asWireframe = false;
		}

		const idx = this.getCellIndex(position);

		if (this.buildings[idx.row][idx.col].buildingType === BuildingType.EMPTY ||
			(this.buildings[idx.row][idx.col].buildingType === BuildingType.CREAM && buildingType !== BuildingType.CREAM)) {
			let building = new Building(buildingType);

			if (buildingType === BuildingType.FACTORY_EXTENSION) {
				if (this.isAboveOfFactory(idx)) {
					building.rotate(Math.PI);
				} else if (this.isRightToFactory(idx)) {
					building.rotate(-Math.PI / 2);
				} else if (this.isLeftToFactory(idx)) {
					building.rotate(Math.PI / 2);
				} else if (!this.isBelowOfFactory(idx)) {
					return undefined;
				}
			} 

			building.adjustPosition(position);
			building.adjustRotation()
			if (asWireframe) {
				this.gameField.add(building.getModelWireframe());
			} else {
				this.gameField.add(building.getModel());
			}
			if (this.buildings[idx.row][idx.col].buildingType === BuildingType.CREAM && this.isPlayerGameField === false) {
				building.hide();
			}
			this.buildings[idx.row][idx.col] = building;
			return idx;
		} else {
			return undefined;
		}
	}
}

export default Gamefield;