import { GameStateTypes, createPlayer, PlayerType, Board, EntityType, BoardCellTypes, createEntity,  getEntityDescriptor, AttackType } from 'battlechoc-shared-functions';
import { InfoType } from '../gameplay/GameActions';

export default class Situation {
    constructor(boardSize, opponentName="Augustus Gloop", playerType=PlayerType.AUGUSTUS_GLOOP, seed=42) {
        this.boardSize = boardSize;
        this.seed = seed

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
                    board: Board.generate({rows: this.boardSize, cols: this.boardSize}, this.seed),
                    isRunning: true,
                    donutProbability: 0,
                    donuts: [],
                    activeDonuts: [],
                    winners: []
                }
            },
            ui: {
                selectedBuilding: EntityType.FACTORY,
                whitelistBuildings: undefined,
                whitelistAttacks: undefined
            }
        };
        this.running = false;
    }

    getFieldAt(board, position, fieldIndex=0) { 
        return board.fields[fieldIndex].grid[position.row * board.size.cols + position.col]
    
    }

    forceStop() {
        this.running = false;
    }

    async build(entityType, position, pseudoGame, spawnInfo, manipulate) {
        this.getFieldAt(pseudoGame.board, position).occupiedBy.push(createEntity(entityType));
        if (entityType === EntityType.CACAOTREE) {
            const descriptor = getEntityDescriptor(entityType);
            let cacaoPerTurn = descriptor.cacaoPerTurn;
            if (this.getFieldAt(pseudoGame.board, position).type === BoardCellTypes.WHITE) {
                cacaoPerTurn = Math.round(cacaoPerTurn * 1.5);
            }
            pseudoGame.players[0].cacaoPerTurn += cacaoPerTurn;
            pseudoGame.players[0].cacao -= descriptor.costs;
            spawnInfo(InfoType.INCREASE_CACAO_PER_TURN, position, cacaoPerTurn);
        } else if (entityType === EntityType.RUM_TRUFFLE_CANNON) {
            const descriptor = getEntityDescriptor(entityType);
            pseudoGame.players[0].attacksPerTurn[AttackType.TRUFFLE] += descriptor.attacksPerTurn;
            pseudoGame.players[0].attacks[AttackType.TRUFFLE] += descriptor.attacksPerTurn;
            pseudoGame.players[0].cacao -= descriptor.costs;
            spawnInfo(InfoType.INCREASE_ATTACKS_PER_TURN, position, descriptor.attacksPerTurn)
        } else if (entityType === EntityType.FACTORY) {
            const descriptor = getEntityDescriptor(entityType);
            let buildingsPerTurn = descriptor.buildingsPerTurn;
            if (this.getFieldAt(pseudoGame.board, position).type === BoardCellTypes.BLACK) {
                buildingsPerTurn += 1;
            }
            pseudoGame.players[0].buildingsPerTurn += buildingsPerTurn;
            spawnInfo(InfoType.INCREASE_BUILDINGS_PER_TURN, position, buildingsPerTurn)
        }
        return await manipulate(pseudoGame);
    }

    modifyBoard({row, col, playerIndex = 0, cellType = BoardCellTypes.BROWN, buildings = [createEntity(EntityType.CREAM)]}) {
        this.game.gameplay.game.board.fields[playerIndex].grid[row * this.boardSize + col].occupiedBy = buildings;  
        this.game.gameplay.game.board.fields[playerIndex].grid[row * this.boardSize + col].occupiedBy.forEach(entity => {
            entity.position = { row: row, col: col };
        });
        this.game.gameplay.game.board.fields[playerIndex].grid[row * this.boardSize + col].type = cellType;
    }
}