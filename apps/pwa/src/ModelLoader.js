import GLTFLoader from 'three-gltf-loader';

class ModelLoader {

    constructor(){
        this.loader = new GLTFLoader();
        this.models = [];
    }

    async loadModels(callback) {
        const files = ['white_tile.gltf', 'brown_tile.gltf', 'black_tile.gltf', 
                        'factory.gltf', 'factory-extension.gltf', 'cacaotree.gltf',
                        'cannon.gltf', 'cream.gltf', 'cream-explosion.gltf',
                        'cacaotree-explosion.gltf', 'factory-explosion.gltf', 'cannon-explosion.gltf'];
        this.models = [];
        for (let i = 0; i < files.length; i++) {
            this.models.push(await this.loadGLTFModel('models/' + files[i]));
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
}

const modelLoader = new ModelLoader();
export default modelLoader;