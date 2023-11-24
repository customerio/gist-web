export const settings = {
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
  GIST_VIEW_ENDPOINT: {
    "prod": "https://code.gist.build/renderer/beta",
    "dev": "https://code.gist.build/renderer/beta",
    "local": "http://app.local.gist.build:8080/web"
  }
}