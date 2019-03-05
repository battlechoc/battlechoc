import GLTFLoader from 'three-gltf-loader';

class AssetLoader {

    constructor(){
        this.loader = new GLTFLoader();
        this.models = [];
    }

    async loadAssets(callback) {
        const files = ['white_tile.glb', 'brown_tile.glb', 'black_tile.glb', 
                        'factory.gltf', 'factory-extension.gltf', 'cacaotree.gltf',
                        'cannon.glb', 'cream.glb', 'cream-explosion.gltf',
                        'cacaotree-explosion.gltf', 'factory-explosion.gltf', 'cannon-explosion.glb', 
                        'creamAroundBuilding.glb', 'attacks_icon.png', 'cacao_icon.png', 'cannon_icon.png', 'cream_preview.png', 'fog_background.png',
                        'buildings_icon.png', 'cacaotree_icon.png', 'cream_icon.png', 'factory_extension_icon.png', 'fog_foreground.png'];
        this.models = [];
        for (let i = 0; i < files.length; i++) {
            if (files[i].endsWith('.glb') || files[i].endsWith('.gltf')) {
                this.models.push(await this.loadGLTFModel('models/' + files[i]));
            } else {
                await this.loadImage('images/' + files[i]);
            }

            if (i === files.length - 1) {
                callback(100);
            } else {
                callback(Math.round((i / (files.length - 1)) * 100));
            }
        }
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