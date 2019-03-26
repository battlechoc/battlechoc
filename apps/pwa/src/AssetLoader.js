import GLTFLoader from 'three-gltf-loader';

class AssetLoader {

    constructor(){
        this.loader = new GLTFLoader();
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
                FRUIT_CANNON: { filename: 'cream.glb', model: null }
            },
            images: {
                ATTACKS: { filename: 'attacks_icon.png' },
                CACAO: { filename: 'cacao_icon.png' },
                CANNON: { filename: 'cannon_icon.png' },
                CREAM_PREVIEW: { filename: 'cream_preview.png' },
                FOG_BACKGROUND: { filename: 'fog_background.png' },
                FOG_FOREGROUND: { filename: 'fog_foreground.png' },
                FACTORY: { filename: 'factory_icon.png' },
                BUILDINGS: { filename: 'buildings_icon.png' },
                CACAOTREE: { filename: 'cacaotree_icon.png' },
                CREAM: { filename: 'cream_icon.png' },
                FACTORY_EXTENSION: { filename: 'factory_extension_icon.png' },
                SPYING_EASTER_BUNNY: { filename: 'spying_easter_bunny_icon.png' },
                SPYING_EASTER_BUNNY_ATTACK: { filename: 'spyingEasterBunnyAttack.png' },
                CHOCOLATE_FOUNTAIN: { filename: 'chocolateFountain_icon.png' },
                XMAS_FACTORY: { filename: 'xmasFactory_icon.png' }
            }
        }
    }

    async loadAssets(callback) {
        const totalResources = Object.keys(this.assets.models).length + Object.keys(this.assets.images).length;
        let loadedResources = 0;
        for (let i = 0; i < Object.keys(this.assets.models).length; i++) {
            this.assets.models[Object.keys(this.assets.models)[i]].model = await this.loadGLTFModel('models/' + this.assets.models[Object.keys(this.assets.models)[i]].filename);
            callback(Math.round((loadedResources / (totalResources - 1)) * 100));
            loadedResources += 1;
        }

        for (let i = 0; i < Object.keys(this.assets.images).length; i++) {
            await this.loadImage('images/' + this.assets.images[Object.keys(this.assets.images)[i]].filename);
            callback(Math.round((loadedResources / (totalResources - 1)) * 100));
            loadedResources += 1;
        }

        callback(100);
    }

    loadGLTFModel(filename) {
        return new Promise((resolve, reject) => {
            this.loader.load(filename, resolve);
        });
    }

    loadImage(src) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.src = src; 
            image.onload = () => resolve();
        });
    }

}

const assetLoader = new AssetLoader();
export default assetLoader;