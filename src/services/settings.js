export const settings = {
  GIST_API_ENDPOINT: {
    "prod": "https://api.gist.build",
    "dev": "https://api.dev.gist.build",
    "local": "http://api.local.gist.build:83"
  },
  GIST_QUEUE_API_ENDPOINT: {
    "prod": "https://gist-queue-consumer-api.cloud.gist.build",
    "dev": "https://gist-queue-consumer-api.cloud.dev.gist.build",
    "local": "http://api.local.gist.build:86"
  },
  GIST_VIEW_ENDPOINT: {
    "prod": "https://renderer.gist.build/1.0",
    "dev": "https://renderer.gist.build/1.0",
    "local": "http://app.local.gist.build:8080/web"
  }
}