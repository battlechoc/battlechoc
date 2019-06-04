import React, { Component } from 'react';
import GLTFLoader from 'three-gltf-loader';
import CircularProgress from '@material-ui/core/CircularProgress';
import { connect } from 'react-redux';
import { assetsReady } from './ui/UiActions';
import { EntityType } from './gameplay/GameEntities';

class AssetLoader {
    constructor(){
        this.assets = {
            models: {
                FIELD: { filename: 'field.glb', model: null },
                [EntityType.FACTORY]: { filename: 'factory.glb', model: null },
                [EntityType.FACTORY + '.EXPLOSION']: { filename: 'factory-explosion.glb', model: null },
                [EntityType.FACTORY_EXTENSION]: { filename: 'factoryExtension.glb', model: null },
                [EntityType.FACTORY_EXTENSION + '.EXPLOSION']: { filename: 'factoryExtension-explosion.glb', model: null },
                [EntityType.CACAOTREE]: { filename: 'cacaotree.glb', model: null },
                [EntityType.CACAOTREE + '.EXPLOSION']: { filename: 'cacaotree-explosion.glb', model: null },
                [EntityType.RUM_TRUFFLE_CANNON]: { filename: 'cannon.glb', model: null },
                [EntityType.RUM_TRUFFLE_CANNON + '.EXPLOSION']: { filename: 'cannon-explosion.glb', model: null },
                [EntityType.CREAM]: { filename: 'cream.glb', model: null },
                [EntityType.CREAM + '.EXPLOSION']: { filename: 'cream-explosion.glb', model: null },
                [EntityType.CREAM + '.AROUND.BUILDING']: { filename: 'creamAroundBuilding.glb', model: null },
                [EntityType.SPYING_EASTER_BUNNY]: { filename: 'spyingEasterBunny.glb', model: null },
                [EntityType.SPYING_EASTER_BUNNY + '.EXPLOSION']: { filename: 'spyingEasterBunny-explosion.glb', model: null },
                [EntityType.XMAS_FACTORY]: { filename: 'xmasFactory.glb', model: null },
                [EntityType.XMAS_FACTORY + '.EXPLOSION']: { filename: 'xmasFactory-explosion.glb', model: null },
                [EntityType.HOT_CHOCOLATE_BALLISTA]: { filename: 'hotChocolateBallista.glb', model: null },
                [EntityType.HOT_CHOCOLATE_BALLISTA + '.EXPLOSION']: { filename: 'hotChocolateBallista-explosion.glb', model: null },
                [EntityType.CHOCOLATE_FOUNTAIN]: { filename: 'chocolateFountain.glb', model: null },
                [EntityType.CHOCOLATE_FOUNTAIN + '.EXPLOSION']: { filename: 'chocolateFountain-explosion.glb', model: null },
                ATTACK_AT_SHIELD_EXPLOSION: { filename: 'attackAtShield-explosion.glb', model: null },
                [EntityType.FRUIT_CANNON]: { filename: 'fruitCannon.glb', model: null },
                [EntityType.FRUIT_CANNON + '.EXPLOSION']: { filename: 'fruitCannon-explosion.glb', model: null }
            },
            images: {
                CACAO_NO_BACKGROUND: { filename: 'cacao_no_background.png' },
                CACAO_PER_TURN: { filename: 'cacaoPerTurn.png' },
                TOOLBAR_ICON_PALETTE: { filename: 'toolbar_icon_palette.png' },
                ATTACKS_PER_TUN: { filename: 'attacksPerTurn.png' },
                CREAM_PREVIEW: { filename: 'cream_preview.png' },
                BUILDINGS_PER_TURN: { filename: 'buildingsPerTurn.png' },
                SPY_ATTACKS_PER_TURN: { filename: 'spyAttacksPerTurn.png' },
                BUNNY_CAUGHT: { filename: 'bunnyCaught.png' },
                LOADING: { filename: '../animations/loading.gif' }
            }
        }
    }    
}

const assetLoader = new AssetLoader();

class AssetLoadingView extends Component {
    constructor(props) {
        super(props);
        this.assetVersion = '2.0';
        this.state = { loadingProgress: 0 }
        this.loader = new GLTFLoader();
    }

    componentDidMount() {
        this.totalResources = Object.keys(assetLoader.assets.models).length + Object.keys(assetLoader.assets.images).length;
        this.loadedResources = 0;

        for (let i = 0; i < Object.keys(assetLoader.assets.models).length; i++) {
            this.loadGLTF(Object.keys(assetLoader.assets.models)[i]).then(() => this.updateProgress());
        }

        for (let i = 0; i < Object.keys(assetLoader.assets.images).length; i++) {
            this.loadImage('images/' + assetLoader.assets.images[Object.keys(assetLoader.assets.images)[i]].filename).then(() => this.updateProgress());
        }
    }

    updateProgress() {
        this.loadedResources += 1;
        if (this.loadedResources === this.totalResources) {
            this.props.assetsReady();
        } else {
            this.setState({ loadingProgress: Math.round((this.loadedResources / (this.totalResources - 1)) * 100) });
        }
    }

    loadGLTF(model) {
        return new Promise((resolve, reject) => {
            this.loader.load('models/' + assetLoader.assets.models[model].filename + '?v=' + this.assetVersion, gltf => {
                assetLoader.assets.models[model].model = gltf;
                resolve();
            });
        });
    }

    loadImage(src) {
        return new Promise((resolve, reject) => {
            let xhr = new XMLHttpRequest();
            xhr.open('GET', src + '?v=' + this.assetVersion);
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve(xhr.response);
              } else {
                reject({ status: xhr.status, statusText: xhr.statusText });
              }
            };
            
            xhr.onerror = () => reject({ status: xhr.status, statusText: xhr.statusText });
            xhr.send();
        });
    }

    render() {
        return <CircularProgress variant="static" value={this.state.loadingProgress} />
    }
}

const mapStateToProps = state => ({ game: state.gameplay.game });
const mapDispatchToProps = { assetsReady };
const AssetLoadingViewContainer = connect(
    mapStateToProps, 
    mapDispatchToProps
)(AssetLoadingView);
export { assetLoader, AssetLoadingViewContainer };