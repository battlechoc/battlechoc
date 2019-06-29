import uuidv4 from 'uuid/v4';
import { AttackType } from './GameEntities';

const PlayerType = Object.freeze({
    HUMAN: 'PlayerType.HUMAN',
    AUGUSTUS_GLOOP: 'PlayerType.AUGUSTUS_GLOOP',
    VIOLET_BEAUREGARDE: 'PlayerType.VIOLET_BEAUREGARDE'
});

function createPlayer(name, type, activePlayer) {
    let player = {
        name: name,
        type: type,
        id: uuidv4(),
        cacao: 100,
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

function playerHasHarmfulAttacksPerTurn(player, playerGrid, otherPlayerGrid) {
    if (player.attacksPerTurn[AttackType.HOT_CHOCOLATE] > 0 ||
        (player.attacksPerTurn[AttackType.TRUFFLE] > 0 && player.attacksPerTurn[AttackType.FRUIT] > 0) ||
        (player.attacksPerTurn[AttackType.TRUFFLE] > 0)) {
        return true;
    } else {
        return false;
    }
}

class NonPlayerCharacter {
    constructor(actions) {
        this.actions = actions;
    }

    simulateThinking(timeToThink) {
        return new Promise(resolve => {
            let timeoutId = setTimeout(resolve, timeToThink);
            this.registerTimeout(timeoutId);
        });
    }

    connectGamestate(callback, registerTimeout) {
        this.registerTimeout = timeout => registerTimeout(timeout);
        this.refreshGameState = () => {
            let game = callback();
            if (typeof game !== 'undefined') { 
                this.gameIsRunning = game.isRunning;
                if (this.gameIsRunning) {
                    this.player = game.players[1];
                    if (typeof game.board !== 'undefined') {
                        this.gamefields = game.board.fields;
                        this.boardSize = game.board.size;
                        this.board = game.board.fields[this.player.fieldIndex];
                        this.opponentBoard = game.board.fields[game.players[0].fieldIndex];
                    }
                }
            } else {
                this.gameIsRunning = undefined;
                this.player = undefined;
                this.gamefields = undefined;
                this.boardSize = undefined;
                this.board = undefined;
                this.opponentBoard = undefined;
            }
        };
        this.refreshGameState();
    }

    async simulateChooseFieldOrStartDecision() { await this.simulateThinking(500) }
    async simulateChooseFieldDecision() { await this.simulateThinking(500) }
    async simulateInitialPlacement() { await this.simulateThinking(500) }
    async simulateAttackPhase() { await this.simulateThinking(500) }
    async simulateBuildPhase() { await this.simulateThinking(500) }
}

export { PlayerType, createPlayer, playerHasAttacksPerTurn, playerHasHarmfulAttacksPerTurn, playerHasAttacks, NonPlayerCharacter };