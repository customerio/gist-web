import { log } from "../utilities/log";
import { getEngineConfiguration } from "../services/engine-service";
import { setKeyWithExpiryToLocalStore, getKeyFromLocalStore } from '../utilities/local-storage';

const engineConfigurationLocalStoreName = "gist.web.engineConfiguration";

export async function bootstrapEngine() {
  var response = await getEngineConfiguration();
  if (response == null || response.status !== 200) return;

  var expiry = new Date();
  expiry.setHours(expiry.getHours() + 1);
  setKeyWithExpiryToLocalStore(engineConfigurationLocalStoreName, response.data, expiry);
  log(`Engine configuration for ${response.data.organizationId} fetched.`);
  return response.data;
}

export async function fetchEngineConfiguration() {
  var engineConfiguration = getKeyFromLocalStore(engineConfigurationLocalStoreName);
  if (engineConfiguration) return engineConfiguration;

  return await bootstrapEngine();
}