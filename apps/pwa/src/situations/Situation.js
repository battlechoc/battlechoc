import { Board, EntityType, BoardCellTypes, createEntity } from '../gameplay/GameEntities';
import { createPlayer, PlayerType } from '../gameplay/Player';
import { GameStateTypes } from '../gameplay/GameplayReducer';

export default class Situation {
	constructor(boardSize, opponentName="Augustus Gloop", playerType=PlayerType.AUGUSTUS_GLOOP) {
		this.boardSize = boardSize;

		let players = [
		    createPlayer("Charlie Bucket", PlayerType.HUMAN),
		    createPlayer(opponentName, playerType)
		];

		this.game = {
			gameplay: {
				game: {
					state: GameStateTypes.BUILD_PHASE,
					players: players,
		            currentPlayerIndex: 0,
		            board: Board.generate({rows: this.boardSize, cols: this.boardSize}, 42),
		            isRunning: true,
		            winners: []
				}
			},
			ui: {
				selectedBuilding: EntityType.FACTORY,
				whitelistBuildings: undefined,
				whitelistAttacks: undefined
			}
        };
	}

	modifyBoard({row, col, playerIndex = 0, cellType = BoardCellTypes.BROWN, buildings = [createEntity(EntityType.CREAM)]}) {
		this.game.gameplay.game.board.fields[playerIndex].grid[row * this.boardSize + col].occupiedBy = buildings;
		this.game.gameplay.game.board.fields[playerIndex].grid[row * this.boardSize + col].type = cellType;
	}
}