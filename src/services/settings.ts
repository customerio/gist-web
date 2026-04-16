import {
  getKeyFromLocalStore,
  setKeyToLocalStore,
  clearKeyFromLocalStore,
} from '../utilities/local-storage';
import { log } from '../utilities/log';
import { v4 as uuidv4 } from 'uuid';
import type { GistEnv } from '../types';

const userQueueUseSSELocalStoreName = 'gist.web.userQueueUseSSE';
const userQueueActiveSSEConnectionLocalStoreName = 'gist.web.activeSSEConnection';
const heartbeatSlop = 5;
let sseHeartbeat = 30;
let sdkId: string | undefined;

export interface Settings {
  RENDERER_HOST: Record<GistEnv, string>;
  ENGINE_API_ENDPOINT: Record<GistEnv, string>;
  GIST_QUEUE_API_ENDPOINT: Record<GistEnv, string>;
  GIST_QUEUE_REALTIME_API_ENDPOINT: Record<GistEnv, string>;
  GIST_VIEW_ENDPOINT: Record<GistEnv, string>;
  getSdkId: () => string;
  useSSE: () => boolean;
  setUseSSEFlag: (useSSE: boolean) => void;
  removeActiveSSEConnection: () => void;
  setActiveSSEConnection: () => void;
  hasActiveSSEConnection: () => unknown;
  isSSEConnectionManagedBySDK: () => boolean;
  getSSEHeartbeat: () => number;
  setSSEHeartbeat: (heartbeat: number) => void;
}

export const settings: Settings = {
  RENDERER_HOST: {
    prod: 'https://code.gist.build',
    dev: 'https://code.gist.build',
    local: 'http://localhost:9998',
  },
  ENGINE_API_ENDPOINT: {
    prod: 'https://engine.api.gist.build',
    dev: 'https://engine.api.dev.gist.build',
    local: 'http://engine.api.local.gist.build:82',
  },
  GIST_QUEUE_API_ENDPOINT: {
    prod: 'https://consumer.cloud.gist.build',
    dev: 'https://consumer.cloud.dev.gist.build',
    local: 'http://localhost:3010',
  },
  GIST_QUEUE_REALTIME_API_ENDPOINT: {
    prod: 'https://realtime.cloud.gist.build',
    dev: 'https://realtime.cloud.dev.gist.build',
    local: 'http://localhost:3009',
  },
  GIST_VIEW_ENDPOINT: {
    prod: 'https://renderer.gist.build/3.0',
    dev: 'https://renderer.gist.build/3.0',
    local: 'http://localhost:9998',
  },
  getSdkId(): string {
    if (!sdkId) {
      sdkId = uuidv4();
    }
    return sdkId as string;
  },
  useSSE(): boolean {
    return (getKeyFromLocalStore(userQueueUseSSELocalStoreName) ?? false) as boolean;
  },
  setUseSSEFlag(useSSE: boolean): void {
    setKeyToLocalStore(
      userQueueUseSSELocalStoreName,
      useSSE,
      new Date(new Date().getTime() + 60000)
    );
    log(`Set user uses SSE to "${useSSE}"`);
  },
  removeActiveSSEConnection(): void {
    clearKeyFromLocalStore(userQueueActiveSSEConnectionLocalStoreName);
  },
  setActiveSSEConnection(): void {
    setKeyToLocalStore(
      userQueueActiveSSEConnectionLocalStoreName,
      settings.getSdkId(),
      new Date(new Date().getTime() + settings.getSSEHeartbeat())
    );
  },
  hasActiveSSEConnection(): unknown {
    return getKeyFromLocalStore(userQueueActiveSSEConnectionLocalStoreName) ?? false;
  },
  isSSEConnectionManagedBySDK(): boolean {
    return getKeyFromLocalStore(userQueueActiveSSEConnectionLocalStoreName) === settings.getSdkId();
  },
  getSSEHeartbeat(): number {
    return (sseHeartbeat + heartbeatSlop) * 1000;
  },
  setSSEHeartbeat(heartbeat: number): void {
    if (heartbeat && heartbeat > 0) {
      sseHeartbeat = heartbeat;
    }
  },
};
