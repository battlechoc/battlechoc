import React, { Component } from 'react';
import './GameEndOverview.css';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { ArrowBack, Share, Refresh } from '@material-ui/icons';
import Fab from '@material-ui/core/Fab';

class GameEndOverview extends Component {
    render() {
        return (<div className="overview">
            <div className="statistics">
                <h1>You won the game</h1>
                <table>
                    <tbody>
                        <tr><td>buildings</td><td>12</td><td>2x</td><td>24</td></tr>
                        <tr><td>cacao</td><td>340</td><td>0x</td><td>0</td></tr>
                        <tr><td>attacks (overall)</td><td>22</td><td>1x</td><td>22</td></tr>
                        <tr><td>harvested cacao (overall)</td><td>22420</td><td>0x</td><td>0</td></tr>
                        <tr><td>buidings (overall)</td><td>21</td><td>2x</td><td>42</td></tr>
                        <tr><td>hit rate</td><td>23%</td><td>2.5x</td><td>58</td></tr>
                        <tr><td>caught bunnies</td><td>0</td><td>10x</td><td>0</td></tr>
                        <tr><td>successful spying attacks</td><td>4</td><td>1.5x</td><td>6</td></tr>
                        <tr><td>failed espionage attacks</td><td>2</td><td>-5x</td><td>-10</td></tr>
                        <tr><td colspan="3">Chocolate Chips</td><td>142</td></tr>
                    </tbody>
                </table>

                <div className="actions">
                    <Fab
                        size="large"
                        color="primary"
                        aria-label="back"
                        className="icon"
                        onClick={() => this.props.finishGame()}>
                        <ArrowBack  />
                    </Fab>
                    <Fab
                        size="large"
                        color="primary"
                        aria-label="back"
                        className="icon"
                        onClick={() => this.props.finishGame()}>
                        <Share />
                    </Fab>
                    <Fab
                        size="large"
                        color="primary"
                        aria-label="back"
                        className="icon"
                        onClick={() => this.props.finishGame()}>
                        <Refresh />
                    </Fab>
                </div>
            </div>
        </div>);
    }
}

GameEndOverview.propTypes = {
    finishGame: PropTypes.func.isRequired
}

const mapStateToProps = state => ({
    game: state.gameplay.game,
    language: state.ui.language
});

const GameEndOverviewContainer = connect(mapStateToProps)(GameEndOverview);
export default GameEndOverviewContainer;