import React, { Component } from 'react';
import GLTFLoader from 'three-gltf-loader';
import CircularProgress from '@material-ui/core/CircularProgress';
import { connect } from 'react-redux';
import { assetsReady } from './ui/UiActions';

class AssetLoader {
    constructor(){
        this.assets = {
            models: {
                FIELD: { filename: 'field.glb', model: null },
                FACTORY: { filename: 'factory.glb', model: null },
                FACTORY_EXPLOSION: { filename: 'factory-explosion.glb', model: null },
                FACTORY_EXTENSION: { filename: 'factoryExtension.glb', model: null },
                FACTORY_EXTENSION_EXPLOSION: { filename: 'factoryExtension-explosion.glb', model: null },
                CACAOTREE: { filename: 'cacaotree.glb', model: null },
                CACAOTREE_EXPLOSION: { filename: 'cacaotree-explosion.glb', model: null },
                RUM_TRUFFLE_CANNON: { filename: 'cannon.glb', model: null },
                RUM_TRUFFLE_CANNON_EXPLOSION: { filename: 'cannon-explosion.glb', model: null },
                CREAM: { filename: 'cream.glb', model: null },
                CREAM_EXPLOSION: { filename: 'cream-explosion.glb', model: null },
                CREAM_AROUND_BUILDING: { filename: 'creamAroundBuilding.glb', model: null },
                SPYING_EASTER_BUNNY: { filename: 'spyingEasterBunny.glb', model: null },
                SPYING_EASTER_BUNNY_EXPLOSION: { filename: 'spyingEasterBunny-explosion.glb', model: null },
                XMAS_FACTORY: { filename: 'xmasFactory.glb', model: null },
                XMAS_FACTORY_EXPLOSION: { filename: 'xmasFactory-explosion.glb', model: null },
                HOT_CHOCOLATE_BALLISTA: { filename: 'hotChocolateBallista.glb', model: null },
                HOT_CHOCOLATE_BALLISTA_EXPLOSION: { filename: 'hotChocolateBallista-explosion.glb', model: null },
                CHOCOLATE_FOUNTAIN: { filename: 'chocolateFountain.glb', model: null },
                CHOCOLATE_FOUNTAIN_EXPLOSION: { filename: 'chocolateFountain-explosion.glb', model: null },
                ATTACK_AT_SHIELD_EXPLOSION: { filename: 'attackAtShield-explosion.glb', model: null },
                FRUIT_CANNON: { filename: 'fruitCannon.glb', model: null },
                FRUIT_CANNON_EXPLOSION: { filename: 'fruitCannon-explosion.glb', model: null }
            },
            images: {
                CACAO_NO_BACKGROUND: { filename: 'cacao_no_background.png' },
                CACAO_PER_TURN: { filename: 'cacaoPerTurn.png' },
                TOOLBAR_ICON_PALETTE: { filename: 'toolbar_icon_palette.png' },
                ATTACKS_PER_TUN: { filename: 'attacksPerTurn.png '},
                CREAM_PREVIEW: { filename: 'cream_preview.png' },
                FOG_BACKGROUND: { filename: 'fog_background.png' },
                FOG_FOREGROUND: { filename: 'fog_foreground.png' },
                BUILDINGS_PER_TURN: { filename: 'buildingsPerTurn.png' },
                SPY_ATTACKS_PER_TURN: { filename: 'spyAttacksPerTurn.png '},
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
            this.loader.load('models/' + assetLoader.assets.models[model].filename, gltf => {
                assetLoader.assets.models[model].model = gltf;
                resolve();
            });
        });
    }

    loadImage(src) {
        return new Promise((resolve, reject) => {
            let xhr = new XMLHttpRequest();
            xhr.open('GET', src);
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