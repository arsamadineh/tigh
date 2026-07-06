# تیغ (Tigh)

موتور API سبک‌وزن و قابل ترکیب برای TypeScript با قابلیت‌های مسیریابی، کش‌کردن، محدودیت نرخ، قطع مدار، middleware و معیارهای عملکردی.

## ویژگی‌ها

- مسیریابی تریه‌ای — مسیریابی سریع با پارامترهای مسیر و وایلدکارد
- کش‌کردن LRU — کش با پشتیبانی TTL و بی‌اعتبارسازی الگو
- محدودیت نرخ — استراتژی‌های Token Bucket، Sliding Window و Fixed Window
- قطع مدار خودکار — تشخیص و بازیابی خودکار از خرابی‌ها
- Middleware سلسله‌ای — با CORS و timing دارالتحریر
- معیارهای جامع — پیگیری درخواست، صدک‌های تأخیر و تجزیه‌وتحلیل عملکردی
- انطباق‌گر Next.js — ادغام مستقیم با مسیرهای API

## نصب

```bash
npm install tigh
# یا
yarn add tigh
# یا
pnpm add tigh
```

## شروع سریع

```typescript
import { Tigh } from 'tigh';

const engine = new Tigh({
  enableCache: true,
  enableRateLimit: true,
  enableMetrics: true,
});

engine.get('/quotes/:id', async (req) => {
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { quote: `نقل‌قول ${req.params.id}` },
  };
});

const response = await engine.handle('GET', '/quotes/42', {
  method: 'GET',
  path: '/quotes/42',
  headers: {},
  query: {},
  params: {},
  timestamp: Date.now(),
});
```

## مستندات

تمام مستندات در دو زبان موجود است:

### انگلیسی

- README.md - دستورالعمل کامل (بالا)
- USAGE_GUIDE.md - راهنمای استفاده تفصیلی
- CONTRIBUTING.md - چگونگی سهم‌گذاری
- CODE_OF_CONDUCT.md - رهنمودهای جامعه

### فارسی

- README_FA.md - دستورالعمل فارسی کامل
- USAGE_GUIDE_FA.md - راهنمای استفاده فارسی
- CONTRIBUTING_FA.md - راهنمای سهم‌گذاری فارسی
- CODE_OF_CONDUCT_FA.md - رهنمودهای جامعه فارسی

## مرجع API

### ایجاد موتور

```typescript
const engine = new Tigh(config?: Partial<EngineConfig>);
```

### تعریف مسیرها

```typescript
engine.get('/api/quotes', async (req) => {
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { quotes: [] },
  };
});

engine.post('/api/quotes', async (req) => {
  return {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
    body: { id: 1, ...req.body },
  };
});

engine.get('/api/quotes/:id', async (req) => {
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { id: req.params.id, text: 'متن نقل‌قول...' },
  };
});

engine.delete('/api/quotes/:id', async (req) => {
  return {
    status: 204,
    headers: {},
    body: null,
  };
});
```

### پارامترهای مسیر

```typescript
// پارامترهای نام‌دار
engine.get('/users/:id', handler);

// مسیرهای وایلدکارد
engine.get('/static/*', handler);
```

### کش‌کردن

```typescript
engine.get(
  '/api/config',
  async (req) => {
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { config: 'data' },
    };
  },
  {
    cache: {
      ttl: 3600000, // 1 ساعت
      key: (req) => 'config',
    },
  }
);

// بی‌اعتبار کردن کش
engine.invalidateCache('config:*');
```

### محدودیت نرخ

```typescript
const engine = new Tigh({
  rateLimit: {
    windowMs: 60000,
    maxRequests: 100,
    strategy: 'token-bucket',
  },
});
```

### Middleware

```typescript
import { corsMiddleware, timingMiddleware } from 'tigh';

engine.use(corsMiddleware({ origin: '*' }));
engine.use(timingMiddleware());

// Middleware سفارشی
engine.use(async (req, next) => {
  console.log(`${req.method} ${req.path}`);
  const res = await next();
  console.log(`Response: ${res.status}`);
  return res;
});
```

### قطع مدار

```typescript
const engine = new Tigh({
  circuitBreaker: {
    failureThreshold: 5,
    recoveryTimeout: 30000,
    halfOpenMaxAttempts: 3,
  },
});
```

### معیارها

```typescript
const metrics = engine.flushMetrics();

console.log(metrics.requests.total);
console.log(metrics.latency.p99);
console.log(metrics.cache.hitRate);
console.log(metrics.circuitBreaker.state);
```

## انطباق‌گر Next.js

```typescript
import { Tigh, createNextHandler } from 'tigh';

const engine = new Tigh({
  enableCache: true,
  enableRateLimit: true,
});

engine.get('/api/quotes/:id', async (req) => {
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { id: req.params.id, quote: '...' },
  };
});

export const GET = createNextHandler(engine);
```

## ساختار پروژه

```
tigh/
├── src/
│   ├── engine.ts                 کلاس موتور اصلی
│   ├── types.ts                  تعریف‌های TypeScript
│   ├── router.ts                 سیستم مسیریابی تریه‌ای
│   ├── cache.ts                  پیاده‌سازی کش LRU
│   ├── rate-limiter.ts           محدودیت نرخ (3 استراتژی)
│   ├── circuit-breaker.ts        قطع مدار خودکار
│   ├── middleware.ts             سیستم middleware
│   ├── metrics.ts                جمع‌آوری معیارها
│   ├── adapter-next.ts           انطباق‌گر Next.js
│   └── index.ts                  export‌های اصلی
├── dist/                         خروجی TypeScript
├── package.json                  وابستگی‌ها
├── tsconfig.json                 تنظیمات TypeScript
├── LICENSE                       مجوز MIT
└── README.md                     این فایل
```

## بهترین عملکردها

1. کش کردن استراتژیک روی داده‌های پر‌خواست، کم‌تغییر
2. معیارها را نظارت کنید برای تشخیص مشکلات
3. قطع مدار را در تولید فعال کنید
4. از HTTPS در تولید استفاده کنید
5. منابع را هنگام خاتمه پاک کنید: engine.destroy()

## مجوز

MIT

## سهم‌گذاری

سهم‌گذاری‌ها خوش‌آمد است. لطفاً CONTRIBUTING_FA.md را ببینید.

## پشتیبانی

برای مسائل و سؤالات:
- GitHub Issues: https://github.com/arsamadineh/tigh/issues
- Discussions: https://github.com/arsamadineh/tigh/discussions

---

ساخته‌شده برای جامعه‌ی فارسی‌زبان.
