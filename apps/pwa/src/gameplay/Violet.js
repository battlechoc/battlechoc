import { NonPlayerCharacter } from './Player';
import { EntityType } from '../gameplay/GameEntities';
import { AttackType } from './GameEntities';
import { BattlechocError } from './Errors';

export default class Violet extends NonPlayerCharacter {
    handleError = error => {
        if (error instanceof BattlechocError) {
            console.warn(error);
        } else {
            console.error(error);
        }
    }

    async simulateChooseFieldOrStartDecision() { }
    async simulateChooseFieldDecision() { }
    async simulateInitialPlacement() { }
    async simulateAttackPhase() {
    	let playerId = this.player.id;
    	await this.simulateThinking(500) 
    	if (typeof this.player !== 'undefined' && playerId === this.playerId) {
    		this.refreshGameState();
	    	console.log(this.player.attacks[AttackType.BUNNY])
	    	console.log(this.opponentBoard.grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.XMAS_FACTORY)).length)
	    	if (this.player.attacks[AttackType.BUNNY] > 0 && 
	    		this.opponentBoard.grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.XMAS_FACTORY)).length > 0) {
	    		await this.actions.attack({ issuer: this.player.id, attackType: AttackType.BUNNY, row: 1, col: 1 }).catch(this.handleError);
	    	}
	    	this.actions.finishTurn({ issuer: this.player.id }).catch(this.handleError);
    	}
    }
    async simulateBuildPhase() {
    	let playerId = this.player.id;
    	await this.simulateThinking(3000);
    	if (typeof this.player !== 'undefined' && playerId === this.playerId) {
    		this.actions.finishBuildPhase({ issuer: this.player.id }).catch(this.handleError);
    	}
    }
}