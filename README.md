[English](https://github.com/mchao123/better-webworker/blob/main/README.md) | [中文](https://github.com/mchao123/better-webworker/blob/main/README.zh-CN.md)

# Better WebWorker

[![npm version](https://img.shields.io/npm/v/better-webworker.svg)](https://www.npmjs.com/package/better-webworker)
[![npm downloads](https://img.shields.io/npm/dm/better-webworker.svg)](https://www.npmjs.com/package/better-webworker)
[![license](https://img.shields.io/npm/l/better-webworker.svg)](https://github.com/mchao123/better-webworker/blob/main/LICENSE)

A library for creating type-safe Web Worker and iframe communication, providing better development experience and type safety.

## Features

- Type-safe Worker/iframe communication
- **Dual mode support**: WebWorker or iframe (with identical API)
- Support function transfer and deserialization
- Automatic Worker/iframe lifecycle management
- Built-in timeout control and error handling
- Seamless integration with Vite

## Installation

```bash
npm install better-webworker
```

## Usage

### Main Thread

```typescript
import { useWorker } from 'better-webworker';

// Create Worker instance
const worker = new Worker(new URL('./worker.ts', import.meta.url), {
  type: 'module'
});

// Get type-safe interface
const { methods, destroy } = useWorker<{
  add(a: number, b: number): number;
  fetchData(url: string): Promise<any>;
}>(worker);

// Call Worker methods
const sum = await methods.add(1, 2); // 3
const data = await methods.fetchData('https://api.example.com/data');

// Clean up resources when done
destroy();
```

### Worker Thread

```typescript
import { defineReceive } from 'better-webworker';

export default defineReceive({
  add(a: number, b: number) {
    return a + b;
  },
  
  async fetchData(url: string) {
    const response = await fetch(url);
    return response.json();
  }
});
```

### Vite Configuration

```typescript
import { defineConfig } from 'vite';
import betterWorker from 'better-webworker/vite';

export default defineConfig({
  plugins: [
    // WebWorker mode (default)
    betterWorker() // Default handles .worker.ts files
    
    // iframe mode - just change one parameter!
    // betterWorker(/\.worker\.ts$/, true)
    
    // Custom file pattern:
    // betterWorker(/\.worker\.(ts|js)$/)
  ]
});
```

**Key Feature**: When using iframe mode (`isIframe: true`), the plugin name automatically changes to `better-iframe` for easy identification. **The worker file code remains exactly the same** - `defineReceive` automatically detects the environment (Worker or iframe) and initializes correctly!

### iframe Mode Usage

```typescript
// main.ts
import createIframe from './example.worker'; // Same import!

const { methods, destroy } = createIframe();

// API is identical to WebWorker mode
await methods.someTask();

// Clean up resources when done (iframe only)
destroy();
```

For detailed iframe usage, see [IFRAME_USAGE.md](./IFRAME_USAGE.md).

### Auto Compilation

When using the Vite plugin, .worker.ts files will be automatically compiled and generate type-safe Worker instances. You just need to directly import the Worker file:

```typescript
// main.ts
import worker from './example.worker';

const { methods } = worker();
await methods.someTask();
```

## API

### `useWorker<T>(worker: Worker)`

Creates a type-safe Worker interface.

- `worker`: Web Worker instance
- Returns: Object containing `methods` with type-safe interfaces for all Worker methods and `destroy()` method for cleanup

### `useIframe<T>(url: string)`

Creates a type-safe iframe interface with identical API to `useWorker`.

- `url`: URL to load in the iframe
- Returns: Object containing `methods` (identical to useWorker) and `destroy()` method

### `defineReceive<T>(handlers: T)`

Defines handler functions for both Worker and iframe environments. **Automatically detects the environment** (Worker or iframe) and initializes correctly - you don't need separate functions!

- `handlers`: Object containing handler functions
- Returns: Worker/iframe initialization function

**This single function works in both environments!** No need for `defineWorkerReceive` or `defineIframeReceive`.

## Notes

1. Ensure Worker files end with `.worker.ts`
2. Vite plugin configuration is required when using Vite
3. Be cautious with closures when transferring functions
4. Set appropriate timeout values

## Examples

Complete examples can be found in the [examples directory](https://github.com/mchao123/better-webworker/blob/main/examples).
