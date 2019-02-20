import React, { Component } from 'react';
import './BuildingPalette.css';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { selectBuilding } from './UiActions';
import { BuildingType } from '../gameplay/GameEntities';
import { GameStateTypes } from '../gameplay/GameplayReducer';

class BuildingPalette extends Component {
    componentWillMount() {
        this.buildingsForSeclection = [{
            type: BuildingType.CACAOTREE,
            image: 'images/cacaotree_icon.png',
            alt: 'cacao tree preview',
            costs: 20
        }, {
            type: BuildingType.RUM_TRUFFLE_CANNON,
            image: 'images/cannon_icon.png',
            alt: 'cannon preview',
            costs: 60
        }, {
            type: BuildingType.FACTORY_EXTENSION,
            image: 'images/factory_extension_icon.png',
            alt: 'factory extension preview',
            costs: 150
        }, {
            type: BuildingType.CREAM,
            image: 'images/cream_icon.png',
            alt: 'cream preview',
            costs: 10
        }];
    }

    buildingSelectionIsVisible() {
        return (this.props.state === GameStateTypes.BUILD_PHASE ||
            this.props.state === GameStateTypes.PLAYER_1_INITIAL_PLACEMENT ||
            this.props.state === GameStateTypes.PLAYER_2_INITIAL_PLACEMENT) && 
            this.props.game.currentPlayerIndex === 0;
    }

    playerCanBuild(costs) {
        return this.props.game.players[0].hasFactory && 
               this.props.game.players[0].cacao >= costs &&
               this.props.game.players[0].buildings > 0;
    }

    render() {
        if (this.props.isVisible) {
            return(
                <div id="buildings">
                {(() => {
                    if (this.buildingSelectionIsVisible()) {
                        return this.buildingsForSeclection.map((building, i) => {
                            return <div className="previewContainer" key={i}>
                                    <div className={this.playerCanBuild(building.costs) ? '' : 'disabled'}></div>
                                    <img alt={building.alt} className={this.playerCanBuild(building.costs) ? 'enabled preview' : 'preview'} src={building.image} onClick={() => {
                                        if (this.playerCanBuild(building.costs)) {
                                            this.props.selectBuilding(building.type);
                                        }
                                    }} />
                            </div>
                        });
                    }
                })()}
                </div>
            );
        } else {
            return null;
        }
    }
}

BuildingPalette.propTypes = {
    isVisible: PropTypes.bool.isRequired
}

const mapStateToProps = state => ({
    game: state.gameplay.game,
    state: typeof state.gameplay.game === 'undefined' ? undefined : state.gameplay.game.state
});

const mapDispatchToProps = {
    selectBuilding
};

const BuildingPaletteContainer = connect(
    mapStateToProps,
    mapDispatchToProps
)(BuildingPalette);

export default BuildingPaletteContainer;