// Shared by contact rendering and push avatars; notifications never fetch Gravatar on a miss.
export const gravatarCache = new Map();
const MAX_ENTRIES = 2000;

export function gravatarCacheSet(hash, entry) {
  if (gravatarCache.size >= MAX_ENTRIES) {
    const oldest = gravatarCache.keys().next().value;
    if (oldest !== undefined) gravatarCache.delete(oldest);
  }
  gravatarCache.set(hash, entry);
}
