import { log } from '../utilities/log';
import { setKeyToLocalStore, getKeyFromLocalStore } from '../utilities/local-storage';
import { getHashedUserToken } from './user-manager';

const broadcastsLocalStoreName = "gist.web.message.broadcasts";
const broadcastsExpiryInDays = 30;

export async function updateBroadcastsLocalStore(messages) {
  const messageBroadcastLocalStoreName = await getMessageBroadcastLocalStoreName();
  if (!messageBroadcastLocalStoreName) return;

  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + broadcastsExpiryInDays);

  const messagesWithBroadcast = messages.filter(isMessageBroadcast);
  setKeyToLocalStore(messageBroadcastLocalStoreName, messagesWithBroadcast, expiryDate);
}

export async function getEligibleBroadcasts() {
  const messageBroadcastLocalStoreName = await getMessageBroadcastLocalStoreName();
  if (!messageBroadcastLocalStoreName) return [];

  const broadcasts = getKeyFromLocalStore(messageBroadcastLocalStoreName) ?? [];
  return broadcasts.filter(broadcast => {
    const { broadcast: broadcastDetails } = broadcast.properties.gist;
    const shouldShow = getKeyFromLocalStore(getBroadcastShouldShowLocalStoreName(messageBroadcastLocalStoreName, broadcast.queueId)) ?? true;
    const numberOfTimesShown = getKeyFromLocalStore(getNumberOfTimesShownLocalStoreName(messageBroadcastLocalStoreName, broadcast.queueId)) || 0;
    const shouldAlwaysShow = broadcastDetails.frequency.count === 0;
    return shouldShow && (shouldAlwaysShow || numberOfTimesShown < broadcastDetails.frequency.count);
  });
}

export async function markBroadcastAsSeen(broadcastId) {
  log(`Marking broadcast ${broadcastId} as seen.`);
  const messageBroadcastLocalStoreName = await getMessageBroadcastLocalStoreName();
  if (!messageBroadcastLocalStoreName) return;
  
  const broadcast = await fetchMessageBroadcast(messageBroadcastLocalStoreName, broadcastId);
  if (!broadcast) return;

  const { broadcast: broadcastDetails } = broadcast.properties.gist;
  const numberOfTimesShownLocalStoreName = getNumberOfTimesShownLocalStoreName(messageBroadcastLocalStoreName, broadcastId);
  const broadcastShouldShowLocalStoreName = getBroadcastShouldShowLocalStoreName(messageBroadcastLocalStoreName, broadcastId);
  let numberOfTimesShown = getKeyFromLocalStore(numberOfTimesShownLocalStoreName) || 0;
  setKeyToLocalStore(numberOfTimesShownLocalStoreName, numberOfTimesShown + 1);

  if (broadcastDetails.frequency.count === 1) {
    setKeyToLocalStore(broadcastShouldShowLocalStoreName, false);
    log(`Marked broadcast ${broadcastId} as seen.`);
  } else {
    let showShowDate = new Date();
    showShowDate.setSeconds(showShowDate.getSeconds() + broadcastDetails.frequency.delay);
    setKeyToLocalStore(broadcastShouldShowLocalStoreName, false, showShowDate);
    log(`Marked broadcast ${broadcastId} as seen, broadcast was seen ${numberOfTimesShown + 1} times, next show date is ${showShowDate}.`);
  }
}

async function fetchMessageBroadcast(messageBroadcastLocalStoreName, broadcastId) {
  const broadcasts = getKeyFromLocalStore(messageBroadcastLocalStoreName);
  return broadcasts.find(message => message.queueId === broadcastId);
}

export function isMessageBroadcast(message) {
  return message.properties && message.properties.gist && message.properties.gist.broadcast;
}

async function getMessageBroadcastLocalStoreName() {
  const userToken = await getHashedUserToken();
  if (!userToken) return null;
  return `${broadcastsLocalStoreName}.${userToken}`;
}

function getNumberOfTimesShownLocalStoreName(messageBroadcastLocalStoreName, broadcastId) {
  return `${messageBroadcastLocalStoreName}.${broadcastId}.numberOfTimesShown`;
}

function getBroadcastShouldShowLocalStoreName(messageBroadcastLocalStoreName, broadcastId) {
  return `${messageBroadcastLocalStoreName}.${broadcastId}.shouldShow`;
}