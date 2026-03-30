const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Allow Metro to bundle .onnx model files
config.resolver.assetExts.push("onnx");
config.resolver.assetExts.push('tflite');

module.exports = config;
