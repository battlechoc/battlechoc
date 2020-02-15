import { NonPlayerCharacter, BattlechocError, EntityType, AttackType } from 'battlechoc-shared-functions';

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
        this.refreshGameState();
        let playerId = this.player.id;
        await this.simulateThinking(500);
        if (typeof this.player !== 'undefined' && playerId === this.player.id) {
            if (this.player.attacks[AttackType.BUNNY] > 0 && 
                this.opponentBoard.grid.filter(cell => cell.occupiedBy.map(entity => entity.type).includes(EntityType.XMAS_FACTORY)).length > 0) {
                await this.actions.attack({ issuer: this.player.id, attackType: AttackType.BUNNY, damage: 0, row: 1, col: 1 }).catch(this.handleError);
            }
            this.actions.finishTurn({ issuer: this.player.id }).catch(this.handleError);
        }
    }
    async simulateBuildPhase() {
        this.refreshGameState();
        let playerId = this.player.id;
        await this.simulateThinking(3000);
        if (typeof this.player !== 'undefined' && playerId === this.player.id) {
            this.actions.finishBuildPhase({ issuer: this.player.id }).catch(this.handleError);
        }
    }
}