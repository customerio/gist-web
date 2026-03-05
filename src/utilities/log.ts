import Gist from '../gist';

export function log(message: string): void {
  if (Gist.config && Gist.config.logging) {
    // eslint-disable-next-line no-console
    console.log(`Gist: ${message}`);
  }
}
