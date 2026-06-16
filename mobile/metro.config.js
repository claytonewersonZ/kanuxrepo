const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.resolver = {
  ...config.resolver,
  resolveRequest: (context, moduleName, platform) => {
    if (moduleName.startsWith('@opentelemetry/')) {
      return { type: 'empty' };
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

module.exports = config;
