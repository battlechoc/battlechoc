import * as THREE from 'three';
import { BuildingType, Building } from './Building.js';
import * as GameEntities from './gameplay/SweastyGameEntities';
import ModelLoader from './ModelLoader.js';

class Gamefield {
	constructor(isPlayerGameField, position, scene, playerField) {
		this.isPlayerGameField = isPlayerGameField;
		this.scene = scene;
		this.rows = 8;
		this.cols = 8;
		this.fieldSize = 8;
		this.position = position;

		this.buildings = [...Array(this.rows)].map(
			field => Array(this.cols).fill(BuildingType.EMPTY)
		);

		this._build(playerField);
		this.scene.add(this.gameField);
	}

	async _build(playerField) {
		this.gameField = new THREE.Group();
		for (let i = 0; i < this.rows; i++) {
			for (let j = 0; j < this.cols; j++) {
				let cell = playerField.grid[i * this.cols + j];
				var fieldClone = undefined;
				if (cell.type === GameEntities.BoardCellTypes.white) {
					fieldClone = ModelLoader.models[0].scene.clone();
				} else if (cell.type === GameEntities.BoardCellTypes.brown) {
					fieldClone = ModelLoader.models[1].scene.clone();
				} else if (cell.type === GameEntities.BoardCellTypes.black) {
					fieldClone = ModelLoader.models[2].scene.clone();
				}

				var field = fieldClone.children[2]
				field.scale.set(3, 3, 3);
				field.position.set(this.fieldSize * i, 0, this.fieldSize * j);

				this.gameField.add(field);

				if (cell.creamed === true) {
					this.setBuilding(field.position, BuildingType.CREAM, this.isPlayerGameField);
				}
			}
		}

		this.gameField.position.set(this.position[0], this.position[1], this.position[2]);
	}

	getClickableFields() {
		return this.gameField.children;
	}

	setBuilding(position, buildingType, asWireframe) {
		if (typeof asWireframe == 'undefined') {
			asWireframe = false;
		}

		let row = position.x / this.fieldSize;
		let col = position.z / this.fieldSize;

		if (this.buildings[row][col] === BuildingType.EMPTY ||
			(this.buildings[row][col] === BuildingType.CREAM && buildingType !== BuildingType.CREAM)) {
			let building = new Building(buildingType);
			building.adjustPosition(position, this.position);
			building.adjustRotation()
			if (asWireframe) {
				this.scene.add(building.getModelWireframe());
			} else {
				this.scene.add(building.getModel());
			}
			this.buildings[row][col] = buildingType;
			return true;
		} else {
			return false;
		}
	}
}

export default Gamefield;