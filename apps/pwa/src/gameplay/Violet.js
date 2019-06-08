import { NonPlayerCharacter } from './Player';

export default class Violet extends NonPlayerCharacter {
    async simulateChooseFieldOrStartDecision() { }
    async simulateChooseFieldDecision() { }
    async simulateInitialPlacement() { }
    async simulateAttackPhase() { 
    	await this.simulateThinking(500) 
    }
    async simulateBuildPhase() { 
    	await this.simulateThinking(3000);
    	this.actions.finishTurn({ issuer: this.player.id });
    }
}