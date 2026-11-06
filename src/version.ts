// Replaced with package.json's version by webpack's DefinePlugin at build time.
declare const __GIST_VERSION__: string | undefined;

export const SDK_VERSION: string = typeof __GIST_VERSION__ === 'string' ? __GIST_VERSION__ : 'dev';
