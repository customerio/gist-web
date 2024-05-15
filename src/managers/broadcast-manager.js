import { log } from '../utilities/log';
import { setKeyToLocalStore, setKeyWithExpiryToLocalStore, getKeyFromLocalStore, clearKeyFromLocalStore } from '../utilities/local-storage';
const broadcastsLocalStoreName = "gist.web.broadcasts";

export function storeBroadcasts(messages) {
  let expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + 30);

  const messagesWithBroadcast = messages.filter(
    message => message.properties && message.properties.gist && message.properties.gist.broadcast
  );
  setKeyWithExpiryToLocalStore(broadcastsLocalStoreName, messagesWithBroadcast, expiryDate);
}

export function getEligibleBroadcasts() {
  var broadcasts = getKeyFromLocalStore(broadcastsLocalStoreName);
  var eligibleBroadcasts = [];

  broadcasts.forEach(broadcast => {
    var broadcastDetails = broadcast.properties.gist.broadcast;
    var shouldShow = getKeyFromLocalStore(broadcastShouldShowLocalStoreName(broadcast.queueId)) || true;
    var numberOfTimesShown = getKeyFromLocalStore(numberOfTimesShownLocalStoreName(broadcast.queueId)) || 0;
    if (shouldShow && broadcastDetails.frequency.count <= numberOfTimesShown) {
      eligibleBroadcasts.push(broadcast);
    }
  });

  return eligibleBroadcasts;
}

export function markBroadcastAsSeen(broadcastId) {
  var broadcastMessage = fetchBroadcast(broadcastId);
  if (!broadcastMessage) return;

  var numberOfTimesShown = getKeyFromLocalStore(numberOfTimesShownLocalStoreName(broadcastId)) || 0;
  setKeyToLocalStore(numberOfTimesShownLocalStoreName(broadcastId), numberOfTimesShown + 1);

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

function fetchBroadcast(broadcastId) {
  var broadcasts = getKeyFromLocalStore(broadcastsLocalStoreName);
  return broadcasts.find(message => message.queueId === broadcastId);
}

function numberOfTimesShownLocalStoreName(broadcastId) { `${broadcastsLocalStoreName}.${broadcastId}.numberOfTimesShown` };
function broadcastShouldShowLocalStoreName(broadcastId) { `${broadcastsLocalStoreName}.${broadcastId}.shouldShow`};