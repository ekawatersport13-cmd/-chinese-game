/// <reference types="vite/client" />

declare module '*.json' {
  const value: {
    radicals?: Array<{ char: string; name: string; strokes: number }>;
    [key: string]: unknown;
  };
  export default value;
}
