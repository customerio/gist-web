import Gist from '../gist';

export function log(message) {
  if (Gist.config.logging) {
    console.log(`Gist: ${message}`);
  }
}