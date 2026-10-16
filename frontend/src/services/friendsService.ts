export interface FriendItem {
  tag: string;
  name: string;
  lastMessage?: {
    id: string;
    senderTag: string;
    text: string;
    timestamp: string;
  } | null;
  acceptedAt?: string;
}

export interface FriendRequestItem {
  tag: string;
  name: string;
  timestamp: string;
}

export interface FriendChatMessage {
  id: string;
  senderTag: string;
  text: string;
  timestamp: string;
}

const LOCAL_STORAGE_FRIENDS_PREFIX = 'brawldraft_friends_';
const LOCAL_STORAGE_MSGS_PREFIX = 'brawldraft_msgs_';

function getStorageKey(myTag: string) {
  return `${LOCAL_STORAGE_FRIENDS_PREFIX}${myTag.replace(/^#/, '').toUpperCase()}`;
}

function getChatKey(tag1: string, tag2: string) {
  const t1 = tag1.replace(/^#/, '').toUpperCase();
  const t2 = tag2.replace(/^#/, '').toUpperCase();
  const pair = [t1, t2].sort().join(':');
  return `${LOCAL_STORAGE_MSGS_PREFIX}${pair}`;
}

// 1. Fetch friend list and pending requests
export async function fetchFriendsData(myTag: string): Promise<{
  friends: FriendItem[];
  pendingIncoming: FriendRequestItem[];
  pendingOutgoing: FriendRequestItem[];
}> {
  const cleanTag = myTag.replace(/^#/, '').toUpperCase();

  try {
    const res = await fetch(`/api/friends/${cleanTag}`);
    if (res.ok) {
      const data = await res.json();
      return {
        friends: data.friends || [],
        pendingIncoming: data.pendingIncoming || [],
        pendingOutgoing: data.pendingOutgoing || [],
      };
    }
  } catch {}

  // Local storage fallback for standalone APK / offline mode
  try {
    const saved = localStorage.getItem(getStorageKey(cleanTag));
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {}

  return { friends: [], pendingIncoming: [], pendingOutgoing: [] };
}

// 2. Send friend request
export async function sendFriendRequest(
  senderTag: string,
  receiverTag: string,
  senderName: string,
  receiverName?: string
): Promise<{ success: boolean; message?: string }> {
  const s = senderTag.replace(/^#/, '').toUpperCase();
  const r = receiverTag.replace(/^#/, '').toUpperCase();

  if (s === r) {
    return { success: false, message: 'No puedes añadirte a ti mismo' };
  }

  try {
    const res = await fetch('/api/friends/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senderTag: s, receiverTag: r, senderName, receiverName }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {}

  // Offline / standalone fallback
  const store = await fetchFriendsData(s);
  if (!store.pendingOutgoing.some((p) => p.tag === `#${r}`) && !store.friends.some((f) => f.tag === `#${r}`)) {
    store.pendingOutgoing.push({
      tag: `#${r}`,
      name: receiverName || r,
      timestamp: new Date().toISOString(),
    });
    localStorage.setItem(getStorageKey(s), JSON.stringify(store));
  }

  // Also update receiver's inbox in local storage if same device
  const receiverStore = await fetchFriendsData(r);
  if (!receiverStore.pendingIncoming.some((p) => p.tag === `#${s}`)) {
    receiverStore.pendingIncoming.push({
      tag: `#${s}`,
      name: senderName || s,
      timestamp: new Date().toISOString(),
    });
    localStorage.setItem(getStorageKey(r), JSON.stringify(receiverStore));
  }

  return { success: true };
}

// 3. Respond to friend request (accept / reject)
export async function respondFriendRequest(
  myTag: string,
  senderTag: string,
  accept: boolean,
  myName?: string,
  senderName?: string
): Promise<{ success: boolean }> {
  const m = myTag.replace(/^#/, '').toUpperCase();
  const s = senderTag.replace(/^#/, '').toUpperCase();

  try {
    const res = await fetch('/api/friends/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ myTag: m, senderTag: s, accept }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {}

  // Local storage fallback
  const myStore = await fetchFriendsData(m);
  myStore.pendingIncoming = myStore.pendingIncoming.filter((p) => p.tag.replace(/^#/, '') !== s);

  if (accept) {
    myStore.friends.push({
      tag: `#${s}`,
      name: senderName || s,
      acceptedAt: new Date().toISOString(),
    });
  }
  localStorage.setItem(getStorageKey(m), JSON.stringify(myStore));

  // Reciprocal update for sender
  const sStore = await fetchFriendsData(s);
  sStore.pendingOutgoing = sStore.pendingOutgoing.filter((p) => p.tag.replace(/^#/, '') !== m);
  if (accept) {
    sStore.friends.push({
      tag: `#${m}`,
      name: myName || m,
      acceptedAt: new Date().toISOString(),
    });
  }
  localStorage.setItem(getStorageKey(s), JSON.stringify(sStore));

  return { success: true };
}

// 4. Fetch Chat Messages with a Friend
export async function fetchFriendMessages(myTag: string, friendTag: string): Promise<FriendChatMessage[]> {
  try {
    const res = await fetch(`/api/friends/chat/${myTag}/${friendTag}`);
    if (res.ok) {
      const data = await res.json();
      return data.messages || [];
    }
  } catch {}

  // Standalone fallback
  try {
    const raw = localStorage.getItem(getChatKey(myTag, friendTag));
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

// 5. Send Chat Message
export async function sendFriendMessage(
  myTag: string,
  friendTag: string,
  text: string
): Promise<FriendChatMessage> {
  const newMsg: FriendChatMessage = {
    id: Math.random().toString(36).substring(2, 9),
    senderTag: `#${myTag.replace(/^#/, '').toUpperCase()}`,
    text: text.trim(),
    timestamp: new Date().toISOString(),
  };

  try {
    const res = await fetch('/api/friends/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senderTag: myTag, receiverTag: friendTag, text }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.message;
    }
  } catch {}

  // Standalone fallback
  const chatKey = getChatKey(myTag, friendTag);
  const msgs = await fetchFriendMessages(myTag, friendTag);
  msgs.push(newMsg);
  localStorage.setItem(chatKey, JSON.stringify(msgs));

  return newMsg;
}
