import { NetworkInstance } from './analytics-network';

export async function logOrganizationEvent(name, messageId, instanceId, queueId, campaignId) {
  try {
    var response = await NetworkInstance().post(`/api/v1/organization/events`, {
      'name': name,
      'route': messageId,
      'instanceId': instanceId,
      'queueId': queueId,
      'campaignId': campaignId,
      'platform': 'web'
    });
    return response;
  } catch (error) {
    return error.response;
  }
}