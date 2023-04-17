import Gist from '../gist';
import { log } from "../utilities/log";
import { getEngineConfiguration } from "../services/engine-service";

export async function bootstrapEngine() {
  var response = await getEngineConfiguration();
  if (response == null || response.status !== 200) return;

  Gist.engineConfiguration = response.data;
  log(`Engine configuration for ${Gist.engineConfiguration.organizationId} fetched.`);
}
