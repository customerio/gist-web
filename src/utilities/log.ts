import Gist from '../gist';

export function log(message: string): void {
  if (Gist.config && Gist.config.logging) {
    console.log(`Gist: ${message}`);
  }
}
