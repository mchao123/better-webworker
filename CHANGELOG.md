# Version 1.0.9 Release Notes

## 🎉 New Feature: iframe Support

`better-webworker` now supports **iframe mode** in addition to WebWorker mode, providing seamless switching between the two with identical APIs.

### ✨ Key Features

#### 1. **Unified API**
- `defineReceive` automatically detects the environment (Worker or iframe)
- Worker files remain **exactly the same** for both modes
- Users don't need to worry about which mode they're using

#### 2. **One-Parameter Switch**
Switch between modes by changing just one parameter in your Vite config:

```ts
// vite.config.ts
export default defineConfig({
  plugins: [
    betterWorker()                      // WebWorker mode
    // betterWorker(/\.worker\.ts$/, true) // iframe mode
  ]
})
```

#### 3. **Automatic Memory Management**
- `useIframe` automatically creates HTML wrappers for script URLs
- Blob URLs are automatically cleaned up when `destroy()` is called
- No memory leaks

#### 4. **Smart URL Handling**
- Automatically detects script URLs (.js/.ts) and wraps them in HTML
- Supports direct HTML URLs and Blob URLs
- All logic is internal to `useIframe` - Vite plugin stays simple

### 📝 Usage Example

```ts
// worker.worker.ts - Works in both modes!
import { defineReceive } from 'better-webworker'

export default defineReceive({
  add: (a, b) => a + b,
  fetchData: async (url) => (await fetch(url)).json()
})

// main.ts
import createWorker from './worker.worker'

const { methods, destroy } = createWorker()
await methods.add(1, 2)
destroy?.() // iframe mode: cleans up iframe + Blob URL
```

### 🔄 Mode Comparison

| Feature | WebWorker | iframe |
|---------|-----------|--------|
| Multi-threading | ✅ Real threads | ❌ Main thread |
| DOM Access | ❌ | ✅ (inside iframe) |
| Performance | ⚡ Better | 🐢 Slower |
| Sandbox | ✅ | ✅ Better isolation |
| Use Case | CPU-intensive tasks | DOM/UI tasks, 3rd party scripts |

### 📦 What's Changed

- **Added**: `useIframe()` function for iframe-based communication
- **Enhanced**: `defineReceive()` now auto-detects Worker vs iframe environment
- **Updated**: Vite plugin supports `isIframe` parameter
- **Improved**: Automatic Blob URL cleanup to prevent memory leaks
- **Docs**: Comprehensive iframe usage guide

### 🔧 Breaking Changes

None! This is a fully backward-compatible release.

### 📖 Documentation

- [IFRAME_USAGE.md](./IFRAME_USAGE.md) - Detailed usage guide
- [README.md](./README.md) - Updated with iframe examples
- [README.zh-CN.md](./README.zh-CN.md) - Chinese documentation

### 🙏 Credits

Thanks to the community for suggesting iframe support!

---

**Full Changelog**: v1.0.8...v1.0.9
