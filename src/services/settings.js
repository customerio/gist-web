import { getKeyFromLocalStore, setKeyToLocalStore } from '../utilities/local-storage';
import { log } from '../utilities/log';
const userQueueVersionLocalStoreName = "gist.web.userQueueVersion";

export const settings = {
  RENDERER_HOST: "https://code.gist.build",
  ENGINE_API_ENDPOINT: {
    "prod": "https://engine.api.gist.build",
    "dev": "https://engine.api.dev.gist.build",
    "local": "http://engine.api.local.gist.build:82"
  },
  GIST_QUEUE_API_ENDPOINT: {
    "prod": "https://gist-queue-consumer-api.cloud.gist.build",
    "dev": "https://gist-queue-consumer-api.cloud.dev.gist.build",
    "local": "http://api.local.gist.build:86"
  },
  GIST_QUEUE_V3_API_ENDPOINT: {
    "prod": "https://consumer.cloud.gist.build",
    "dev": "https://consumer.cloud.dev.gist.build",
    "local": "http://api.local.gist.build:86"
  },
  GIST_VIEW_ENDPOINT: {
    "prod": "https://renderer.gist.build/3.0",
    "dev": "https://renderer.gist.build/3.0",
    "local": "http://app.local.gist.build:8080/web"
  },
  getQueueAPIVersion: function() {
    return getKeyFromLocalStore(userQueueVersionLocalStoreName) ?? "2";
  },
  setQueueAPIVersion: function(version) {
    // The Queue API version TTL is renewed with every poll request and extended by 30 minutes.
    setKeyToLocalStore(userQueueVersionLocalStoreName, version, new Date(new Date().getTime() + 1800000));
    log(`Set user queue version to "${version}"`);
  }
}