# Better WebWorker

A library for creating type-safe Web Worker communication, providing better development experience and type safety.

## Features

- Type-safe Worker communication
- Support function transfer and deserialization
- Automatic Worker lifecycle management
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
const { methods } = useWorker<{
  add(a: number, b: number): number;
  fetchData(url: string): Promise<any>;
}>(worker);

// Call Worker methods
const sum = await methods.add(1, 2); // 3
const data = await methods.fetchData('https://api.example.com/data');
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
    betterWorker() // Default handles .worker.ts files
    // Custom file pattern:
    // betterWorker(/\.worker\.(ts|js)$/)
  ]
});
```

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
- Returns: Object containing `methods` with type-safe interfaces for all Worker methods

### `defineReceive<T>(handlers: T)`

Defines Worker-side handler functions.

- `handlers`: Object containing handler functions
- Returns: Worker initialization function

## Notes

1. Ensure Worker files end with `.worker.ts`
2. Vite plugin configuration is required when using Vite
3. Be cautious with closures when transferring functions
4. Set appropriate timeout values

## Examples

Complete examples can be found in the [examples directory](./examples).
