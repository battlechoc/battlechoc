import React, { Component } from 'react';
import { multiplayer } from '../Multiplayer';
import './InfoPanel.css';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';

class InfoPanel extends Component {
    componentDidMount() {
        if (typeof this.props.onRef !== 'undefined') {
            this.props.onRef(this);
        }
    }

    update() {
        this.forceUpdate();
    }

    getPlayerIndex() {
        if (typeof this.props.pseudoGame !== 'undefined') {
            return 0;
        } else {
            return multiplayer.localPlayerIndex;
        }
    }

    render() {
        const game = typeof this.props.pseudoGame !== 'undefined' ? this.props.pseudoGame : this.props.game;
        const playerIndex = this.getPlayerIndex();
        if (this.props.isVisible) {
            return (
                <div id="gameMenu">
                    <div className="infoIcon">
                        <div className="cacao info" style={{ backgroundImage: 'url(images/toolbar_icon_palette.png)' }} />
                        <p>{game.players[playerIndex].cacao}</p>
                    </div>
                    <div className="infoIcon">
                        <div className="buildings info" style={{ backgroundImage: 'url(images/toolbar_icon_palette.png)' }} />
                        <p>{game.players[playerIndex].buildings + '/' + game.players[playerIndex].buildingsPerTurn}</p>
                    </div>
                </div>
            );
        } else {
            return null;
        }
    }
}

InfoPanel.propTypes = {
    isVisible: PropTypes.bool.isRequired,
    pseudoGame: PropTypes.object
}

const mapStateToProps = state => ({
    game: state.gameplay.game
});

const InfoPanelContainer = connect(
    mapStateToProps
)(InfoPanel);

export default InfoPanelContainer;