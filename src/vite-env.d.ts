/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** When truthy, `exposeForTesting()` is called even in production-like builds. */
  readonly VITE_EXPOSE_TESTING?: string;
  /** Comma-separated list of wss:// / ws:// signaling servers used for network sync failover. */
  readonly VITE_NETWORK_SIGNALING_SERVERS?: string;
  /** Backward-compatible alias for signaling server list. */
  readonly VITE_NETWORK_SIGNALING_URLS?: string;
  /** Single signaling server URL (used if list vars are unset). */
  readonly VITE_NETWORK_SIGNALING_URL?: string;
}

declare module '*?worker' {
  const workerConstructor: {
    new (): Worker;
  };
  export default workerConstructor;
}
