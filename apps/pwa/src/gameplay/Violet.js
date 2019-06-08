import { NonPlayerCharacter } from './Player';
import { EntityType } from '../gameplay/GameEntities';
import { AttackType } from './GameEntities';

export default class Violet extends NonPlayerCharacter {
    async simulateChooseFieldOrStartDecision() { }
    async simulateChooseFieldDecision() { }
    async simulateInitialPlacement() { }
    async simulateAttackPhase() { 
    	await this.simulateThinking(500) 
    	if (typeof this.player !== 'undefined') {
    		this.refreshGameState();
	    	console.log(this.player.attacks[AttackType.BUNNY])
	    	console.log(this.opponentBoard.grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.XMAS_FACTORY)).length)
	    	if (this.player.attacks[AttackType.BUNNY] > 0 && 
	    		this.opponentBoard.grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.XMAS_FACTORY)).length > 0) {
	    		await this.actions.attack({ issuer: this.player.id, attackType: AttackType.BUNNY, row: 1, col: 1 });
	    	}
	    	this.actions.finishTurn({ issuer: this.player.id });
    	}
    }
    async simulateBuildPhase() { 
    	await this.simulateThinking(3000);
    	if (typeof this.player !== 'undefined') {
    		this.actions.finishBuildPhase({ issuer: this.player.id });
    	}
    }
}