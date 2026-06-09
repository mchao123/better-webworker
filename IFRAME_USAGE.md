# iframe 模式使用指南

`better-webworker` 现在支持两种模式：

1. **WebWorker 模式**（默认）：使用 Web Worker 进行多线程通信
2. **iframe 模式**：使用 iframe 进行沙箱隔离通信

**两种模式的 API 完全一致，使用时用户完全无感。**

## 配置 Vite 插件

### WebWorker 模式（默认）

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import betterWorker from 'better-webworker/vite'

export default defineConfig({
  plugins: [
    betterWorker() // 默认使用 WebWorker 模式
  ]
})
```

### iframe 模式

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import betterWorker from 'better-webworker/vite'

export default defineConfig({
  plugins: [
    betterWorker(/\.worker\.ts$/, true) // 第二个参数为 true 启用 iframe 模式
  ]
})
```

插件名称会自动变更：
- WebWorker 模式：`better-worker`
- iframe 模式：`better-iframe`

## 使用方式

### 1. 定义 Worker/iframe 方法（完全相同）

**关键改进：`defineReceive` 会自动检测运行环境（Worker 或 iframe），无需区分！**

```ts
// worker.worker.ts
import { defineReceive } from 'better-webworker'

// 这个文件可以同时在 Worker 和 iframe 中运行
// defineReceive 会自动检测环境并正确初始化
export default defineReceive({
  add(a: number, b: number) {
    return a + b
  },
  async fetchData(url: string) {
    const response = await fetch(url)
    return response.json()
  }
})
```

### 2. 在主线程中使用

#### WebWorker 模式

```ts
// main.ts
import createWorker from './worker.worker.ts'

const { methods } = createWorker()

// 类型安全的调用
const sum = await methods.add(1, 2) // 返回 3
const data = await methods.fetchData('https://api.example.com')

// 配置超时
methods.timeout = 10000
```

#### iframe 模式

```ts
// main.ts
import createIframe from './worker.worker.ts' // 同样的文件！

const { methods, destroy } = createIframe()

// API 完全一致！
const sum = await methods.add(1, 2) // 返回 3
const data = await methods.fetchData('https://api.example.com')

// 配置超时
methods.timeout = 10000

// iframe 模式提供了 destroy 方法来清理资源
destroy()
```

## API 对比

| 特性 | WebWorker 模式 | iframe 模式 | 说明 |
|------|---------------|------------|------|
| Vite 插件配置 | `betterWorker()` | `betterWorker(/\.worker\.ts$/, true)` | 只改这一个参数 |
| 插件名称 | `better-worker` | `better-iframe` | 自动变更 |
| Worker 文件 | `defineReceive` | `defineReceive` | **完全相同** |
| 主线程导入 | `createWorker()` | `createIframe()` | 导入的函数名不同 |
| `methods` API | ✅ 完全一致 | ✅ 完全一致 | 方法调用方式相同 |
| 超时配置 | ✅ `methods.timeout` | ✅ `methods.timeout` | 配置方式相同 |
| Transferable | ✅ `method.transfer` | ✅ `method.transfer` | 支持 Transferable 对象 |
| 资源清理 | 自动 | `destroy()` | iframe 需要手动清理 |

## 完整示例

### Worker 文件（两种模式共用）

```ts
// worker.worker.ts
import { defineReceive } from 'better-webworker'

export default defineReceive({
  add(a: number, b: number) {
    return a + b
  },
  
  multiply(a: number, b: number) {
    return a * b
  },
  
  async fetchData(url: string) {
    const response = await fetch(url)
    return response.json()
  }
})
```

### 主线程文件

```ts
// main.ts
import createWorker from './worker.worker'

// 定义类型接口
interface WorkerAPI {
  add(a: number, b: number): number
  multiply(a: number, b: number): number
  fetchData(url: string): Promise<any>
}

const { methods, destroy } = createWorker() as ReturnType<
  typeof import('better-webworker').useWorker<WorkerAPI>
>

// 使用方法
const sum = await methods.add(10, 20)
console.log('Sum:', sum) // 30

const product = await methods.multiply(5, 6)
console.log('Product:', product) // 30

// 配置全局超时
methods.timeout = 15000

// 配置单个方法
methods.fetchData.timeout = 30000

// 清理资源（仅 iframe 模式需要）
// ⚠️ 重要：destroy() 会自动释放 Blob URL，防止内存泄漏
destroy?.()
```

## 两种模式的区别

### WebWorker 模式

**优点：**
- 真正的多线程，不会阻塞主线程
- 性能更好，适合 CPU 密集型任务
- 资源自动管理

**缺点：**
- 不能访问 DOM
- 受同源策略限制
- 部分浏览器 API 不可用

### iframe 模式

**优点：**
- 可以访问 DOM（iframe 内部）
- 更好的沙箱隔离
- 可以加载完整的 HTML 页面
- 适合需要 UI 或特殊浏览器环境的场景

**缺点：**
- 运行在主线程，可能影响性能
- 需要手动调用 `destroy()` 清理资源
- 额外的 DOM 开销

## 切换模式

只需修改 Vite 配置中的一个参数，Worker 文件代码无需任何改动：

```ts
// 从 WebWorker 切换到 iframe
export default defineConfig({
  plugins: [
    betterWorker()                        // WebWorker 模式
    // betterWorker(/\.worker\.ts$/, true) // iframe 模式
  ]
})
```

## 选择建议

- **使用 WebWorker 模式**：适合计算密集型任务、数据处理、后台任务
- **使用 iframe 模式**：适合需要 DOM 访问、沙箱隔离、第三方脚本隔离的场景

