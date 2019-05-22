import { Board, EntityType, BoardCellTypes } from '../gameplay/GameEntities';
import { createPlayer, PlayerType } from '../gameplay/Player';
import { GameStateTypes } from '../gameplay/GameplayReducer';

export default class Situation {
	constructor(boardSize) {
		this.boardSize = boardSize;

		let players = [
		    createPlayer("Charlie Bucket", PlayerType.HUMAN),
		    createPlayer("Augustus Gloop", PlayerType.AUGUSTUS_GLOOP)
		];

		this.game = {
			gameplay: {
				game: {
					state: GameStateTypes.BUILD_PHASE,
					players: players,
		            currentPlayerIndex: 0,
		            board: Board.generate({rows: this.boardSize, cols: this.boardSize}, 42),
		            isRunning: true
				}
			},
			ui: {
				selectedBuilding: EntityType.FACTORY
			}
        };
	}

	modifyBoard({row, col, playerIndex = 0, cellType = BoardCellTypes.BROWN, buildings = [EntityType.CREAM]}) {
		this.game.gameplay.game.board.fields[playerIndex].grid[row * this.boardSize + col].occupiedBy = buildings;
		this.game.gameplay.game.board.fields[playerIndex].grid[row * this.boardSize + col].type = cellType;
	}
}