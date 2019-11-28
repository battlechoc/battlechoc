    const {InjectManifest} = require('workbox-webpack-plugin');
    const path = require('path');

    module.exports = {
      webpack: function(config, env) {
        config.plugins.push(
          new InjectManifest({
            globPatterns: [
              'images/*.png',
              'models/*.glb',
              'music/*.mp3',
              'sound/*.mp3'
            ],
            globDirectory: 'build',
            swSrc: path.join('src', 'custom-service-worker.js'),
            swDest: 'service-worker.js',
            maximumFileSizeToCacheInBytes: 4 * 1024 * 1024
          })
        );

        return config;
      }
    }