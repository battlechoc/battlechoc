import Situation from '../Situation';
import { GameStateTypes } from '../../gameplay/GameplayReducer';

export default class ChoosePageTutorialSituation extends Situation {
    constructor() {
        super(8);
        this.game.gameplay.game.state = GameStateTypes.CHOOSE_FIELD_OR_START;
    }
    static get ui() {
        return (new ChoosePageTutorialSituation()).game.ui;
    }

    static get gameplay() {
        return (new ChoosePageTutorialSituation()).game.gameplay.game;
    }
}