import { getKeyFromLocalStore, setKeyToLocalStore, clearKeyFromLocalStore } from '../utilities/local-storage';
import { log } from '../utilities/log';
import { v4 as uuidv4 } from 'uuid';
const userQueueUseSSELocalStoreName = "gist.web.userQueueUseSSE";
const userQueueActiveSSEConnectionLocalStoreName = "gist.web.activeSSEConnection";
const heartbeatSlop = 5;
let sseHeartbeat = 30;
let sdkId;

export const settings = {
  RENDERER_HOST: "https://code.gist.build",
  ENGINE_API_ENDPOINT: {
    "prod": "https://engine.api.gist.build",
    "dev": "https://engine.api.dev.gist.build",
    "local": "http://engine.api.local.gist.build:82"
  },
  GIST_QUEUE_API_ENDPOINT: {
    "prod": "https://consumer.inapp.customer.io",
    "dev": "https://consumer.dev.inapp.customer.io",
    "local": "http://api.local.gist.build:86"
  },
  GIST_QUEUE_REALTIME_API_ENDPOINT: {
    "prod": "https://consumer.inapp.customer.io",
    "dev": "https://consumer.dev.inapp.customer.io",
    "local": "http://api.local.gist.build:3000"
  },
  GIST_VIEW_ENDPOINT: {
    "prod": "https://renderer.inapp.customer.io/3.0",
    "dev": "https://renderer.inapp.customer.io/3.0",
    "local": "http://app.local.gist.build:8080/web"
  },
  getSdkId: function() {
    if (!sdkId) {
      sdkId = uuidv4();
    }
    return sdkId;
  },
  useSSE: function() {
    return getKeyFromLocalStore(userQueueUseSSELocalStoreName) ?? false;
  },
  setUseSSEFlag: function(useSSE) {
    setKeyToLocalStore(userQueueUseSSELocalStoreName, useSSE, new Date(new Date().getTime() + 60000));
    log(`Set user uses SSE to "${useSSE}"`);
  },
  removeActiveSSEConnection: function() {
    clearKeyFromLocalStore(userQueueActiveSSEConnectionLocalStoreName);
  },
  setActiveSSEConnection: function() {
    setKeyToLocalStore(userQueueActiveSSEConnectionLocalStoreName, settings.getSdkId(), new Date(new Date().getTime() + settings.getSSEHeartbeat()));
  },
  hasActiveSSEConnection: function() {
    return getKeyFromLocalStore(userQueueActiveSSEConnectionLocalStoreName) ?? false;
  },
  isSSEConnectionManagedBySDK: function() {
    return getKeyFromLocalStore(userQueueActiveSSEConnectionLocalStoreName) === settings.getSdkId();
  },
  getSSEHeartbeat: function() {
    return (sseHeartbeat + heartbeatSlop) * 1000;
  },
  setSSEHeartbeat: function(heartbeat) {
    if (heartbeat && heartbeat > 0) {
      sseHeartbeat = heartbeat;
    }
  }
}