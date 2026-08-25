export function createCache() {
  const store = new Map();

  return {
    get(key) {
      const hit = store.get(key);
      if (!hit) return null;
      if (Date.now() > hit.exp) {
        store.delete(key);
        return null;
      }
      return hit.val;
    },
    set(key, val, ttlMs) {
      store.set(key, { val, exp: Date.now() + ttlMs });
      return val;
    }
  };
}
