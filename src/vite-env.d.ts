/// <reference types="vite/client" />

// Declare Vite ?url imports for asset URLs
declare module '*?url' {
  const url: string;
  export default url;
}

// Declare raw imports (needed for WASM)
declare module '*.wasm?url' {
  const url: string;
  export default url;
}
