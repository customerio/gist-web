import { log } from '../utilities/log';
import { setKeyToLocalStore, getKeyFromLocalStore } from '../utilities/local-storage';
import { getHashedUserToken } from './user-manager';
import type { GistMessage } from '../types';

const broadcastsLocalStoreName = 'gist.web.message.broadcasts';
const broadcastsExpiryInMinutes = 60;

interface BroadcastFrequency {
  count: number;
  delay: number;
  ignoreDismiss?: boolean;
}

export async function updateBroadcastsLocalStore(messages: GistMessage[]): Promise<void> {
  const messageBroadcastLocalStoreName = await getMessageBroadcastLocalStoreName();
  if (!messageBroadcastLocalStoreName) return;

  const expiryDate = new Date();
  expiryDate.setMinutes(expiryDate.getMinutes() + broadcastsExpiryInMinutes);

  const messagesWithBroadcast = messages.filter(isMessageBroadcast);
  setKeyToLocalStore(messageBroadcastLocalStoreName, messagesWithBroadcast, expiryDate);
}

export async function getEligibleBroadcasts(): Promise<GistMessage[]> {
  const messageBroadcastLocalStoreName = await getMessageBroadcastLocalStoreName();
  if (!messageBroadcastLocalStoreName) return [];

  const broadcasts =
    (getKeyFromLocalStore(messageBroadcastLocalStoreName) as GistMessage[] | null | undefined) ??
    [];
  return broadcasts.filter((broadcast) => {
    const broadcastDetails = broadcast.properties!.gist!.broadcast as {
      frequency: BroadcastFrequency;
    };
    const { frequency } = broadcastDetails;
    const shouldShow =
      (getKeyFromLocalStore(
        getBroadcastShouldShowLocalStoreName(messageBroadcastLocalStoreName, broadcast.queueId!)
      ) as boolean | null | undefined) ?? true;
    const numberOfTimesShown =
      (getKeyFromLocalStore(
        getNumberOfTimesShownLocalStoreName(messageBroadcastLocalStoreName, broadcast.queueId!)
      ) as number | null | undefined) || 0;
    const isFrequencyUnlimited = frequency.count === 0;
    return shouldShow && (isFrequencyUnlimited || numberOfTimesShown < frequency.count);
  });
}

export async function markBroadcastAsSeen(broadcastId: string): Promise<void> {
  log(`Marking broadcast ${broadcastId} as seen.`);
  const messageBroadcastLocalStoreName = await getMessageBroadcastLocalStoreName();
  if (!messageBroadcastLocalStoreName) return;

  const broadcast = await fetchMessageBroadcast(messageBroadcastLocalStoreName, broadcastId);
  if (!broadcast) return;

  const broadcastDetails = broadcast.properties!.gist!.broadcast as {
    frequency: BroadcastFrequency;
  };
  const { frequency } = broadcastDetails;
  const numberOfTimesShownLocalStoreName = getNumberOfTimesShownLocalStoreName(
    messageBroadcastLocalStoreName,
    broadcastId
  );
  const broadcastShouldShowLocalStoreName = getBroadcastShouldShowLocalStoreName(
    messageBroadcastLocalStoreName,
    broadcastId
  );
  const numberOfTimesShown =
    (getKeyFromLocalStore(numberOfTimesShownLocalStoreName) as number | null | undefined) || 0;
  setKeyToLocalStore(numberOfTimesShownLocalStoreName, numberOfTimesShown + 1);

  if (frequency.count === 1) {
    setKeyToLocalStore(broadcastShouldShowLocalStoreName, false);
    log(`Marked broadcast ${broadcastId} as seen.`);
  } else {
    const nextShowDate = new Date();
    nextShowDate.setSeconds(nextShowDate.getSeconds() + frequency.delay);
    setKeyToLocalStore(broadcastShouldShowLocalStoreName, false, nextShowDate);
    log(
      `Marked broadcast ${broadcastId} as seen, broadcast was seen ${numberOfTimesShown + 1} times, next show date is ${nextShowDate}.`
    );
  }
}

export async function markBroadcastAsDismissed(broadcastId: string): Promise<void> {
  log(`Marking broadcast ${broadcastId} as dismissed.`);
  const messageBroadcastLocalStoreName = await getMessageBroadcastLocalStoreName();
  if (!messageBroadcastLocalStoreName) return;

  const broadcast = await fetchMessageBroadcast(messageBroadcastLocalStoreName, broadcastId);
  if (!broadcast) return;

  const broadcastDetails = broadcast.properties!.gist!.broadcast as {
    frequency: BroadcastFrequency;
  };
  const ignoreDismiss = broadcastDetails.frequency.ignoreDismiss;

  if (ignoreDismiss === true) {
    log(`Broadcast ${broadcastId} is set to ignore dismiss.`);
    return;
  }

  const broadcastShouldShowLocalStoreName = getBroadcastShouldShowLocalStoreName(
    messageBroadcastLocalStoreName,
    broadcastId
  );
  setKeyToLocalStore(broadcastShouldShowLocalStoreName, false);
  log(`Marked broadcast ${broadcastId} as dismissed and will not show again.`);
}

async function fetchMessageBroadcast(
  messageBroadcastLocalStoreName: string,
  broadcastId: string
): Promise<GistMessage | undefined> {
  const broadcasts = getKeyFromLocalStore(messageBroadcastLocalStoreName) as
    | GistMessage[]
    | null
    | undefined;
  return broadcasts?.find((message) => message.queueId === broadcastId);
}

export function isMessageBroadcast(message: GistMessage): boolean {
  return !!(message.properties?.gist && message.properties.gist.broadcast);
}

export function isShowAlwaysBroadcast(message: GistMessage): boolean {
  if (!isMessageBroadcast(message)) return false;
  const broadcastDetails = message.properties!.gist!.broadcast as {
    frequency: BroadcastFrequency;
  };
  return broadcastDetails.frequency.delay === 0 && broadcastDetails.frequency.count === 0;
}

async function getMessageBroadcastLocalStoreName(): Promise<string | null> {
  const userToken = await getHashedUserToken();
  if (!userToken) return null;
  return `${broadcastsLocalStoreName}.${userToken}`;
}

function getNumberOfTimesShownLocalStoreName(
  messageBroadcastLocalStoreName: string,
  broadcastId: string
): string {
  return `${messageBroadcastLocalStoreName}.${broadcastId}.numberOfTimesShown`;
}

function getBroadcastShouldShowLocalStoreName(
  messageBroadcastLocalStoreName: string,
  broadcastId: string
): string {
  return `${messageBroadcastLocalStoreName}.${broadcastId}.shouldShow`;
}
