import uuidv4 from 'uuid/v4';
import { EntityType, AttackType, createEntity, getEntityDescriptor } from './GameEntities';
import { NoBuildingsLeftError, NoCacaoLeftError, BuildNotPossibleError, NoAttacksLeftError, TargetEmptyError, InvalidActionIssuer } from './Errors';

const PlayerType = Object.freeze({
    HUMAN: 'PlayerType.HUMAN',
    AUGUSTUS_GLOOP: 'PlayerType.AUGUSTUS_GLOOP'
});

function createPlayer(name, type, activePlayer) {
    let player = {
        name: name,
        type: type,
        id: uuidv4(),
        cacao: 50,
        cacaoPerTurn: 0,
        buildings: 0,
        buildingsPerTurn: 0,
        attacks: {},
        attacksPerTurn: {},
        hasFactory: false
    };
    player.attacks[AttackType.TRUFFLE] = 0;
    player.attacks[AttackType.HOT_CHOCOLATE] = 0;
    player.attacks[AttackType.FRUIT] = 0;
    player.attacks[AttackType.BUNNY] = 0;
    player.attacksPerTurn[AttackType.TRUFFLE] = 0;
    player.attacksPerTurn[AttackType.HOT_CHOCOLATE] = 0;
    player.attacksPerTurn[AttackType.FRUIT] = 0;
    player.attacksPerTurn[AttackType.BUNNY] = 0;
    return player;
}

function playerHasAttacks(player) {
    return (player.attacks[AttackType.TRUFFLE] +
        player.attacks[AttackType.HOT_CHOCOLATE] +
        player.attacks[AttackType.FRUIT] +
        player.attacks[AttackType.BUNNY]) > 0;
}

function playerHasAttacksPerTurn(player) {
    return (player.attacksPerTurn[AttackType.TRUFFLE] +
        player.attacksPerTurn[AttackType.HOT_CHOCOLATE] +
        player.attacksPerTurn[AttackType.FRUIT] +
        player.attacksPerTurn[AttackType.BUNNY]) > 0;
}

function playerHasHarmfulAttacksPerTurn(player) {
    return (player.attacksPerTurn[AttackType.TRUFFLE] + player.attacksPerTurn[AttackType.HOT_CHOCOLATE]) > 0;
}

class Augustus {
    constructor(actions, player) {
        this.actions = actions;
    }

    connectGamestate(callback) {
        this.refreshGameState = () => {
            let game = callback();
            this.gameIsRunning = typeof game !== 'undefined';
            if (this.gameIsRunning) { 
                this.player = game.players[1];
                this.gamefields = game.board.fields;
                this.board = game.board.fields[this.player.fieldIndex];
                this.opponentBoard = game.board.fields[game.players[0].fieldIndex];
            }
        };
    }

    simulateThinking(timeToThink) {
        return new Promise(resolve => setTimeout(resolve, timeToThink));
    }

    scoreFields() {
        return [this.gamefields[0].grid.filter(cell => cell.occupiedBy.includes(EntityType.CREAM)).length,
                this.gamefields[1].grid.filter(cell => cell.occupiedBy.includes(EntityType.CREAM)).length];
    }

    async simulateChooseFieldOrStartDecision() {
        await this.simulateThinking(1500);
        this.refreshGameState();
        if (this.gameIsRunning) {
            const scores = this.scoreFields();
            if (scores[0] === scores[1]) {
                this.actions.chooseStart({ issuer: this.player.id });
            } else if (scores[0] > scores[1]) {
                this.actions.chooseField({ fieldIdx: 0, issuer: this.player.id });
            } else {
                this.actions.chooseField({ fieldIdx: 1, issuer: this.player.id });
            }
        }
    }

    async simulateChooseFieldDecision() {
        await this.simulateThinking(1500);
        this.refreshGameState();
        if (this.gameIsRunning) {
            const scores = this.scoreFields();
            if (scores[0] === scores[1]) {
                const decision = Math.round(Math.random());
                if (decision === 0) {
                    this.actions.chooseField({ fieldIdx: 0, issuer: this.player.id });
                } else {
                    this.actions.chooseField({ fieldIdx: 1, issuer: this.player.id });
                }
            } else if (scores[0] > scores[1]) {
                this.actions.chooseField({ fieldIdx: 0, issuer: this.player.id });
            } else {
                this.actions.chooseField({ fieldIdx: 1, issuer: this.player.id });
            }
        }
    }

    async simulateInitialPlacement(uiGamefield) {
        await this.simulateThinking(1500);
        this.refreshGameState();
        if (this.gameIsRunning) {
            const creamedCells = this.board.grid.filter(cell => cell.occupiedBy.includes(EntityType.CREAM));
            const building = createEntity(EntityType.FACTORY);
            this.setBuildingAtRandomPosition(creamedCells, building, uiGamefield).then(() => {
                setTimeout(() => {
                    this.actions.finishTurn({ issuer: this.player.id });
                }, 3000);
            }).catch(error => {
                if (error instanceof NoBuildingsLeftError) {
                    console.log(error.message);
                } else if (error instanceof NoCacaoLeftError) {
                    console.log(error.message);
                } else if (error instanceof BuildNotPossibleError) {
                    console.log(error.message);
                } else if (error instanceof InvalidActionIssuer) {
                    console.log(error.message);
                } else {
                    throw error;
                }
            });
        }
    }

    estimateAttackTarget() {
        let unveiledFactories = this.opponentBoard.grid.filter(cell => !cell.occupiedBy.includes(EntityType.CREAM) && cell.occupiedBy.includes(EntityType.FACTORY));
        let unveiledCannons = this.opponentBoard.grid.filter(cell => !cell.occupiedBy.includes(EntityType.CREAM) && cell.occupiedBy.includes(EntityType.RUM_TRUFFLE_CANNON));
        let unveiledFactoryExtensions = this.opponentBoard.grid.filter(cell => !cell.occupiedBy.includes(EntityType.CREAM) && cell.occupiedBy.includes(EntityType.FACTORY_EXTENSION));
        let unveiledTrees = this.opponentBoard.grid.filter(cell => !cell.occupiedBy.includes(EntityType.CREAM) && cell.occupiedBy.includes(EntityType.CACAOTREE));
        let unveiledSpyingEasterBunny = this.opponentBoard.grid.filter(cell => !cell.occupiedBy.includes(EntityType.CREAM) && cell.occupiedBy.includes(EntityType.SPYING_EASTER_BUNNY));
        let unveiledXmasFactory = this.opponentBoard.grid.filter(cell => !cell.occupiedBy.includes(EntityType.CREAM) && cell.occupiedBy.includes(EntityType.XMAS_FACTORY));
        let creamedCells = this.opponentBoard.grid.filter(cell => cell.occupiedBy.includes(EntityType.CREAM));

        if (unveiledFactories.length > 0) {
            return unveiledFactories[0];
        } else if (unveiledFactoryExtensions.length > 0) {
            return unveiledFactoryExtensions[0];
        } else if (unveiledSpyingEasterBunny.length > 0) {
            return unveiledSpyingEasterBunny[0];
        } else if (unveiledCannons.length > 0) {
            return unveiledCannons[0];
        } else if (unveiledTrees.length > 0) {
            return unveiledTrees[0];
        } else if (unveiledXmasFactory.length > 0) {
            return unveiledXmasFactory[0];
        } else if (creamedCells.length > 0) {
            return creamedCells[Math.floor(Math.random() * creamedCells.length)];
        } else {
            return this.opponentBoard.grid[Math.floor(Math.random() * this.opponentBoard.grid.length)];
        }
    }

    handleAttackError(error) {
        if (error instanceof NoAttacksLeftError) {
            console.error(error.message);
            this.actions.finishTurn({ issuer: this.player.id });
        } else if (error instanceof TargetEmptyError) {
            console.error(error.message);
            this.actions.finishTurn({ issuer: this.player.id });
        } else {
            throw error;
        }        
    }

    simulateAttack(target, attackType, gamefield3d, opponentGameField3d) {
        this.actions.attack({
            issuer: this.player.id,
            attackType: attackType,
            row: target.row,
            col: target.col
        }).then(() => {
            this.refreshGameState();
            if (attackType === AttackType.BUNNY) {
                if (this.player.attacksPerTurn[AttackType.BUNNY] > 0) {
                  opponentGameField3d.attack({ row: target.row, col: target.col }, AttackType.BUNNY);
                } else {
                  gamefield3d.meltDownEasterBunny();
                  opponentGameField3d.receiveBallista({ row: target.row, col: target.col });
                }
            } else {
                opponentGameField3d.attack({ row: target.row, col: target.col }, attackType);
            }
            this.simulateAttackPhase(gamefield3d, opponentGameField3d);
        }).catch(error => this.handleAttackError(error));  
    }

    async simulateAttackPhase(gamefield3d, opponentGameField3d) {
        await this.simulateThinking(1500);
        this.refreshGameState();
        if (this.gameIsRunning) {
            let creamyFields = this.opponentBoard.grid.filter(cell => cell.occupiedBy.includes(EntityType.CREAM));

            if (this.player.attacks[AttackType.BUNNY] > 0 && creamyFields.length) {
                let target = creamyFields[Math.floor(Math.random()*creamyFields.length)];
                console.log('OPPONENT BUNNY IS GOING TO SPY :', target);
                this.simulateAttack(target, AttackType.BUNNY, gamefield3d, opponentGameField3d);
            } else if (this.player.attacks[AttackType.TRUFFLE] > 0) {
                let target = this.estimateAttackTarget();
                this.simulateAttack(target, AttackType.TRUFFLE, gamefield3d, opponentGameField3d);
            } else {
                this.actions.finishTurn({ issuer: this.player.id });
            }
        }
    }

    setBuildingAtRandomPosition(possibleCells, building, uiGamefield) {
        return new Promise((resolve, reject) => {
            let randomCell = possibleCells[Math.floor(Math.random() * possibleCells.length)];
            console.log('DEV HINT: ', building.type, randomCell.row, randomCell.col);
            let randomPosition = {
                x: randomCell.row * uiGamefield.fieldSize,
                y: 0,
                z: randomCell.col * uiGamefield.fieldSize
            }
            building.position = {
                row: randomCell.row,
                col: randomCell.col
            }

            this.actions.build({ issuer: this.player.id, building: building }).then(() => {
                uiGamefield.setBuilding(randomPosition, building.type, {row: randomCell.row, col: randomCell.col});
                resolve();
            }).catch(error => { reject(error); });
        });
    }

    handleBuildError(error) {
        if (error instanceof NoBuildingsLeftError) {
            console.log(error.message);
        } else if (error instanceof NoCacaoLeftError) {
            console.log(error.message);
        } else if (error instanceof BuildNotPossibleError) {
            console.log(error.message);
        } else if (error instanceof InvalidActionIssuer) {
            console.log(error.message);
        } else {
            throw error;
        }
        this.actions.finishBuildPhase({ issuer: this.player.id });      
    }

    async simulateBuildPhase(uiGamefield) {
        await this.simulateThinking(1500);
        this.refreshGameState();
        if (this.gameIsRunning) {
            if (this.player.buildings === 0) {
                this.actions.finishBuildPhase({ issuer: this.player.id });
            } else {
                let cacao = this.player.cacao;

                let creamedCells = this.board.grid.filter(cell => cell.occupiedBy.includes(EntityType.CREAM) && cell.occupiedBy.length === 1);
                let freeCells = this.board.grid.filter(cell => cell.molten === false && cell.occupiedBy.length === 0);
                let treeCount = this.board.grid.filter(cell => cell.occupiedBy.includes(EntityType.CACAOTREE)).length;
                let bunnyCount = this.board.grid.filter(cell => cell.occupiedBy.includes(EntityType.SPYING_EASTER_BUNNY)).length;
                let cannonCount = this.board.grid.filter(cell => cell.occupiedBy.includes(EntityType.RUM_TRUFFLE_CANNON)).length;
                let xmasFactoryCount = this.board.grid.filter(cell => cell.occupiedBy.includes(EntityType.XMAS_FACTORY)).length;

                let cannon = getEntityDescriptor(EntityType.RUM_TRUFFLE_CANNON);
                let tree = getEntityDescriptor(EntityType.CACAOTREE);
                let xmasFactory = getEntityDescriptor(EntityType.XMAS_FACTORY);
                let easterBunny = getEntityDescriptor(EntityType.SPYING_EASTER_BUNNY);
                let cream = getEntityDescriptor(EntityType.CREAM);

                if (creamedCells.length > 0 && cacao >= easterBunny.costs && bunnyCount === 0) {
                    let building = createEntity(EntityType.SPYING_EASTER_BUNNY);
                    this.setBuildingAtRandomPosition(creamedCells, building, uiGamefield).then(() => {
                        this.simulateBuildPhase(uiGamefield);
                    }).catch(error => this.handleBuildError(error));
                } else if (creamedCells.length > 0 && cacao >= xmasFactory.costs && xmasFactoryCount < 2) {
                    let building = createEntity(EntityType.XMAS_FACTORY);
                    this.setBuildingAtRandomPosition(creamedCells, building, uiGamefield).then(() => {
                        this.simulateBuildPhase(uiGamefield);
                    }).catch(error => this.handleBuildError(error));
                } else if (creamedCells.length > 0 && (cacao >= tree.costs || cacao >= cannon.costs)) {
                    let building;
                    if (treeCount < 2) {
                        building = createEntity(EntityType.CACAOTREE);
                    } else if (cannonCount < 3 && cacao >= cannon.costs) {
                        building = createEntity(EntityType.RUM_TRUFFLE_CANNON);
                    } else {
                        const decision = Math.round(Math.random());
                        if (decision === 0 || cacao < cannon.costs) {
                            building = createEntity(EntityType.CACAOTREE);
                        } else {
                            building = createEntity(EntityType.RUM_TRUFFLE_CANNON);
                        }
                    }

                    this.setBuildingAtRandomPosition(creamedCells, building, uiGamefield).then(() => {
                        this.simulateBuildPhase(uiGamefield);
                    }).catch(error => this.handleBuildError(error));
                } else if (freeCells.length > 0 && cacao >= cream.costs) {
                    this.setBuildingAtRandomPosition(freeCells, createEntity(EntityType.CREAM), uiGamefield).then(() => {
                        this.simulateBuildPhase(uiGamefield);
                    }).catch(error => this.handleBuildError(error));
                } else {
                    this.actions.finishBuildPhase({ issuer: this.player.id });
                }
            }
        }
    }
}

export { PlayerType, createPlayer, playerHasAttacksPerTurn, playerHasHarmfulAttacksPerTurn, playerHasAttacks, Augustus };