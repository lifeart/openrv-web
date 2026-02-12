/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** When truthy, `exposeForTesting()` is called even in production-like builds. */
  readonly VITE_EXPOSE_TESTING?: string;
}

declare module '*?worker' {
  const workerConstructor: {
    new (): Worker;
  };
  export default workerConstructor;
}
