const path = require('path');
const { getDefaultConfig } = require('@expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..', '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = config.watchFolders || [];
config.watchFolders.push(path.resolve(workspaceRoot, 'packages'));

config.resolver = config.resolver || {};

config.resolver.extraNodeModules = Object.assign({}, config.resolver.extraNodeModules, {
  '@/backend': path.resolve(workspaceRoot, 'packages', 'backend'),
});

config.resolver.alias = Object.assign({}, config.resolver.alias, {
  '@/backend': path.resolve(workspaceRoot, 'packages', 'backend'),
});

module.exports = config;
