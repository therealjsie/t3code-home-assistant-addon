// Keep plaintext credentials in memory only. The supported T3 list command
// omits credentials, so only tokens issued here can be displayed.
export function createPairingManager(run, now = Date.now) {
  let current = null;
  let creating = null;
  const parse = (result) => {
    if (!result.ok) throw new Error("T3 pairing command failed. Check that the server is running.");
    try { return JSON.parse(result.stdout.trim()); }
    catch { throw new Error("T3 returned an unreadable pairing response."); }
  };
  return {
    async status() {
      if (!current) return null;
      if (Date.parse(current.expiresAt) <= now()) { current = null; return null; }
      const checked = current;
      const links = parse(await run("t3", ["auth", "pairing", "list", "--json"]));
      if (!Array.isArray(links)) throw new Error("T3 returned an unreadable pairing list.");
      if (checked !== current) return current;
      // A used or revoked one-time token disappears from the active list.
      if (!links.some((link) => link.id === current.id)) current = null;
      return current;
    },
    create() {
      if (creating) return creating;
      creating = (async () => {
        const link = parse(await run("t3", ["auth", "pairing", "create", "--json", "--ttl", "15m", "--label", "Home Assistant LAN"]));
        if (typeof link.id !== "string" || typeof link.credential !== "string" || !link.credential ||
            !Number.isFinite(Date.parse(link.expiresAt)) || Date.parse(link.expiresAt) <= now()) {
          throw new Error("T3 returned an incomplete pairing credential.");
        }
        current = { id: link.id, token: link.credential, expiresAt: link.expiresAt };
        return current;
      })().finally(() => { creating = null; });
      return creating;
    },
  };
}
