import { log } from '../utilities/log';
import { setKeyToLocalStore, setKeyWithExpiryToLocalStore, getKeyFromLocalStore } from '../utilities/local-storage';
import { getHashedUserToken } from './user-manager';

const broadcastsLocalStoreName = "gist.web.message.broadcasts";

export async function updateBroadcastsLocalStore(messages) {
  const messageBroadcastLocalStoreName = await getMessageBroadcastLocalStoreName();
  if (!messageBroadcastLocalStoreName) return;

  let expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + 30);

  const messagesWithBroadcast = messages.filter(
    message => isMessageBroadcast(message)
  );
  setKeyWithExpiryToLocalStore(messageBroadcastLocalStoreName, messagesWithBroadcast, expiryDate);
}

export async function getEligibleBroadcasts() {
  const messageBroadcastLocalStoreName = await getMessageBroadcastLocalStoreName();
  if (!messageBroadcastLocalStoreName) return;

  var broadcasts = getKeyFromLocalStore(messageBroadcastLocalStoreName) ?? [];
  var eligibleBroadcasts = [];

  broadcasts.forEach(broadcast => {
    var broadcastDetails = broadcast.properties.gist.broadcast;
    var shouldShow = getKeyFromLocalStore(getBroadcastShouldShowLocalStoreName(messageBroadcastLocalStoreName, broadcast.queueId)) || true;
    var numberOfTimesShown = getKeyFromLocalStore(getNumberOfTimesShownLocalStoreName(messageBroadcastLocalStoreName, broadcast.queueId)) || 1;
    if (shouldShow && broadcastDetails.frequency.count >= numberOfTimesShown) {
      eligibleBroadcasts.push(broadcast);
    }
  });

  return eligibleBroadcasts;
}

export async function markBroadcastAsSeen(broadcastId) {
  log(`Marking broadcast ${broadcastId} as seen.`);
  const messageBroadcastLocalStoreName = await getMessageBroadcastLocalStoreName();
  if (!messageBroadcastLocalStoreName) return;

  const numberOfTimesShownLocalStoreName = getNumberOfTimesShownLocalStoreName(messageBroadcastLocalStoreName, broadcastId);
  const broadcastShouldShowLocalStoreName = getBroadcastShouldShowLocalStoreName(messageBroadcastLocalStoreName, broadcastId);
  var numberOfTimesShown = getKeyFromLocalStore(numberOfTimesShownLocalStoreName) || 0;
  setKeyToLocalStore(numberOfTimesShownLocalStoreName, numberOfTimesShown + 1);

  if (broadcastDetails.frequency.count <= 1) {
    setKeyToLocalStore(broadcastShouldShowLocalStoreName, false);
    log(`Marked broadcast ${broadcastId} as seen.`);
  } else {
    let showShowDate = new Date();
    let delayInSeconds = broadcastDetails.frequency.delay;
    showShowDate.setSeconds(showShowDate.getSeconds() + delayInSeconds);
    setKeyWithExpiryToLocalStore(broadcastShouldShowLocalStoreName, false, showShowDate);
    log(`Marked broadcast ${broadcastId} as seen, broadcast was seen ${numberOfTimesShown + 1}, next show date is ${showShowDate}.`);
  }
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
  return `${messageBroadcastLocalStoreName}.${broadcastId}.numberOfTimesShown`
};

function getBroadcastShouldShowLocalStoreName(messageBroadcastLocalStoreName, broadcastId) {
  return `${messageBroadcastLocalStoreName}.${broadcastId}.shouldShow`
};