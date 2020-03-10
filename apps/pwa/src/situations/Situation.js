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
    }

    getFieldAt(board, position, fieldIndex=0) { 
        return board.fields[fieldIndex].grid[position.row * board.size.cols + position.col]
    }

    async build(entityType, position, pseudoGame, spawnInfo, manipulate) {  
        this.getFieldAt(pseudoGame.board, position).occupiedBy.push(createEntity(entityType));
        const descriptor = getEntityDescriptor(entityType);
        if (entityType === EntityType.CACAOTREE) {
            let cacaoPerTurn = descriptor.cacaoPerTurn;
            if (this.getFieldAt(pseudoGame.board, position).type === BoardCellTypes.WHITE) {
                cacaoPerTurn = Math.round(cacaoPerTurn * 1.5);
            }
            pseudoGame.players[0].cacaoPerTurn += cacaoPerTurn;
            pseudoGame.players[0].cacao -= descriptor.costs;
            pseudoGame.players[0].buildings -= 1;
            spawnInfo(InfoType.INCREASE_CACAO_PER_TURN, position, cacaoPerTurn);
        } else if (entityType === EntityType.RUM_TRUFFLE_CANNON) {
            pseudoGame.players[0].attacksPerTurn[AttackType.TRUFFLE] += descriptor.attacksPerTurn;
            pseudoGame.players[0].attacks[AttackType.TRUFFLE] += descriptor.attacksPerTurn;
            pseudoGame.players[0].cacao -= descriptor.costs;
            pseudoGame.players[0].buildings -= 1;
            spawnInfo(InfoType.INCREASE_ATTACKS_PER_TURN, position, descriptor.attacksPerTurn)
        } else if (entityType === EntityType.FACTORY || entityType === EntityType.FACTORY_EXTENSION) {
            let buildingsPerTurn = descriptor.buildingsPerTurn;
            if (this.getFieldAt(pseudoGame.board, position).type === BoardCellTypes.BLACK) {
                buildingsPerTurn += 1;
            }
            if (entityType === EntityType.FACTORY_EXTENSION) {
                pseudoGame.players[0].buildings -= 1;
                pseudoGame.players[0].cacao -= descriptor.costs;
            }
            pseudoGame.players[0].buildingsPerTurn += buildingsPerTurn;
            spawnInfo(InfoType.INCREASE_BUILDINGS_PER_TURN, position, buildingsPerTurn)
        } else if (entityType === EntityType.SPYING_EASTER_BUNNY) {
            pseudoGame.players[0].attacks[AttackType.BUNNY] += 1;
            pseudoGame.players[0].attacksPerTurn[AttackType.BUNNY] += 1;
            spawnInfo(InfoType.INCREASE_SPY_ATTACKS_PER_TURN, position, 1);
            pseudoGame.players[0].buildings -= 1;
            pseudoGame.players[0].cacao -= descriptor.costs;
        } else if (entityType === EntityType.FRUIT_CANNON) {
            this.getFieldAt(pseudoGame.board, position).occupiedBy = this.getFieldAt(pseudoGame.board, position).occupiedBy.filter(entity => entity.type !== EntityType.RUM_TRUFFLE_CANNON);
            pseudoGame.players[0].attacks[AttackType.FRUIT] += 1;
            pseudoGame.players[0].attacksPerTurn[AttackType.FRUIT] += 1;
            pseudoGame.players[0].buildings -= 1;
            pseudoGame.players[0].cacao -= descriptor.costs;
        } else if ([EntityType.CREAM, EntityType.XMAS_FACTORY, EntityType.CHOCOLATE_FOUNTAIN, EntityType.DONUT_FACTORY].includes(entityType)) {
            pseudoGame.players[0].cacao -= descriptor.costs;
            pseudoGame.players[0].buildings -= 1;
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