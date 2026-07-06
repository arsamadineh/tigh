# تیغ (Tigh)

موتور API سبک‌وزن و قابل ترکیب برای TypeScript با قابلیت‌های مسیریابی، کش‌کردن، محدودیت نرخ، قطع مدار، middleware و معیارهای عملکردی.

## ویژگی‌ها ✨

- **مسیریابی تریه‌ای** — مسیریابی سریع با پارامترهای مسیر و وایلدکارد
- **کش‌کردن LRU** — کش با پشتیبانی TTL و بی‌اعتبارسازی الگو
- **محدودیت نرخ** — استراتژی‌های Token Bucket، Sliding Window و Fixed Window
- **قطع مدار خودکار** — تشخیص و بازیابی خودکار از خرابی‌ها
- **Middleware سلسله‌ای** — با CORS و timing دارالتحریر
- **معیارهای جامع** — پیگیری درخواست، صدک‌های تأخیر و تجزیه‌وتحلیل عملکردی
- **انطباق‌گر Next.js** — ادغام مستقیم با مسیرهای API

## نصب 📦

```bash
npm install tigh
# یا
yarn add tigh
# یا
pnpm add tigh
```

## شروع سریع ⚡

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

## مرجع API 📚

### ایجاد موتور

```typescript
const engine = new Tigh(config?: Partial<EngineConfig>);
```

**گزینه‌های پیکربندی:**

```typescript
interface EngineConfig {
  cache: {
    maxSize: number;           // پیش‌فرض: 10000
    defaultTTL: number;        // پیش‌فرض: 60000ms
    checkInterval: number;     // پیش‌فرض: 30000ms
  };
  rateLimit: {
    windowMs: number;          // پیش‌فرض: 60000ms
    maxRequests: number;       // پیش‌فرض: 100
    strategy: 'token-bucket' | 'sliding-window' | 'fixed-window';
  };
  circuitBreaker: {
    failureThreshold: number;  // پیش‌فرض: 5
    recoveryTimeout: number;   // پیش‌فرض: 30000ms
    halfOpenMaxAttempts: number; // پیش‌فرض: 3
    monitoringPeriod: number;  // پیش‌فرض: 60000ms
  };
  enableMetrics: boolean;      // پیش‌فرض: true
  enableCache: boolean;        // پیش‌فرض: true
  enableRateLimit: boolean;    // پیش‌فرض: true
  enableCircuitBreaker: boolean; // پیش‌فرض: true
  cors: {
    origin: string | string[]; // پیش‌فرض: '*'
    methods: string[];
    headers: string[];
    maxAge: number;
  };
}
```

### تعریف مسیرها

**روش‌های میانبر:**

```typescript
engine.get(path, handler, options?);
engine.post(path, handler, options?);
engine.put(path, handler, options?);
engine.delete(path, handler, options?);
```

**مثال:**

```typescript
// دریافت تمام نقل‌قول‌ها
engine.get('/api/quotes', async (req) => {
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { quotes: [] },
  };
});

// ایجاد نقل‌قول جدید
engine.post('/api/quotes', async (req) => {
  const newQuote = req.body as { text: string };
  return {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
    body: { id: 1, text: newQuote.text },
  };
});

// دریافت نقل‌قول با ID
engine.get('/api/quotes/:id', async (req) => {
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { id: req.params.id, text: 'متن نقل‌قول...' },
  };
});

// حذف نقل‌قول
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
// پارامترهای نام‌دار: /users/:id -> params.id = "123"
engine.get('/users/:id', handler);

// مسیرهای چندگانه: /posts/:postId/comments/:commentId
engine.get('/posts/:postId/comments/:commentId', handler);

// مسیرهای وایلدکارد: /static/* -> params['*'] = "css/style.css"
engine.get('/static/*', handler);
```

### پارامترهای Query

```typescript
engine.get('/api/search', async (req) => {
  const { q, limit, offset } = req.query;
  
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      query: q,
      limit: parseInt(limit || '10'),
      offset: parseInt(offset || '0'),
      results: [],
    },
  };
});

// استفاده: GET /api/search?q=test&limit=20
```

## کش‌کردن 💾

### فعال‌کردن کش روی مسیرها

```typescript
engine.get(
  '/api/config',
  async (req) => {
    const config = await fetchConfig();
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: config,
    };
  },
  {
    cache: {
      ttl: 3600000, // 1 ساعت
    },
  }
);
```

### کلیدهای کش سفارشی

```typescript
engine.get(
  '/api/user/:userId/profile',
  async (req) => {
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { profile: 'data' },
    };
  },
  {
    cache: {
      ttl: 300000,
      key: (req) => `user:${req.params.userId}:profile`,
    },
  }
);
```

### بی‌اعتبارسازی کش

```typescript
// بی‌اعتبار کردن تمام کش‌های مرتبط با کاربر
engine.invalidateCache('user:*:profile');

// بی‌اعتبار کردن کش کاربر خاص
engine.invalidateCache('user:123:profile');
```

### سرصحفه‌های کش

موتور به طور خودکار سرصحفه‌های وضعیت کش را اضافه می‌کند:

```
X-Cache: HIT    // از کش سرو شد
X-Cache: MISS   // کش‌نشده، تازه تولید شد
```

## محدودیت نرخ 🚦

### محدودیت نرخ جهانی

```typescript
const engine = new Tigh({
  rateLimit: {
    windowMs: 60000,        // پنجره 1 دقیقه‌ای
    maxRequests: 100,       // 100 درخواست در هر پنجره
    strategy: 'token-bucket',
  },
});
```

### استراتژی‌های محدودیت نرخ

```typescript
// Token Bucket - محدودیت صاف، امکان انفجار
const engine = new Tigh({
  rateLimit: { strategy: 'token-bucket' },
});

// Sliding Window - دقیق‌تر ولی حافظه بیشتری استفاده می‌کند
const engine = new Tigh({
  rateLimit: { strategy: 'sliding-window' },
});

// Fixed Window - سریع ولی مستعد مشکل مرز
const engine = new Tigh({
  rateLimit: { strategy: 'fixed-window' },
});
```

### تولید کلید سفارشی

```typescript
const engine = new Tigh({
  rateLimit: {
    keyGenerator: (req) => {
      // محدودیت بر اساس شناسه کاربر یا IP
      return req.headers['x-user-id'] || req.ip;
    },
  },
});
```

### پاسخ محدودیت نرخ

```json
HTTP/1.1 429 Too Many Requests

{
  "error": "Too Many Requests",
  "message": "محدودیت نرخ تجاوز شد"
}

Headers:
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1625097660000
Retry-After: 60
```

## Middleware 🔧

### Middleware دارالتحریر

```typescript
import { corsMiddleware, timingMiddleware, compressMiddleware } from 'tigh';

engine.use(corsMiddleware({
  origin: ['https://example.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  headers: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

engine.use(timingMiddleware());
engine.use(compressMiddleware());
```

### Middleware سفارشی

```typescript
// Middleware احراز‌هویت
engine.use(async (req, next) => {
  const token = req.headers['authorization'];
  
  if (!token) {
    return {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'بدون‌اختیار' },
    };
  }
  
  return next();
});

// Middleware گزارش‌دهی
engine.use(async (req, next) => {
  console.log(`→ ${req.method} ${req.path}`);
  const start = performance.now();
  
  const res = await next();
  
  console.log(`← ${res.status} (${(performance.now() - start).toFixed(2)}ms)`);
  return res;
});
```

## قطع مدار 🔌

### پیکربندی

```typescript
const engine = new Tigh({
  circuitBreaker: {
    failureThreshold: 5,      // باز بعد از 5 خرابی
    recoveryTimeout: 30000,   // تلاش برای بازیابی بعد از 30s
    halfOpenMaxAttempts: 3,   // 3 تلاش در نیم‌باز
    monitoringPeriod: 60000,  // نظارت روی 60s
  },
});
```

### حالت‌ها

- **بسته (Closed)** — عملکرد عادی، درخواست‌ها عبور می‌کنند
- **باز (Open)** — خرابی‌ها تجاوز کردند، درخواست‌ها مسدود می‌شوند
- **نیم‌باز (Half-Open)** — تلاش برای بازیابی، درخواست‌های محدود

### پاسخ هنگام باز بودن

```json
HTTP/1.1 503 Service Unavailable

{
  "error": "Service Unavailable",
  "message": "قطع مدار باز است. لطفاً بعداً دوباره تلاش کنید."
}
```

## معیارها 📊

### جمع‌آوری معیارها

```typescript
const metrics = engine.flushMetrics();

console.log(metrics.requests.total);              // کل درخواست‌ها
console.log(metrics.latency.p99);                 // تأخیر صدک 99
console.log(metrics.cache.hitRate);               // نرخ موفقیت کش
console.log(metrics.cache.memoryBytes);           // حافظه استفاده‌شده
console.log(metrics.circuitBreaker.state);        // وضعیت قطع مدار
console.log(metrics.rateLimit.rejected);          // درخواست‌های رد‌شده
```

## مثال کامل 🎯

```typescript
import { Tigh, corsMiddleware, timingMiddleware } from 'tigh';

const engine = new Tigh({
  cache: { maxSize: 5000, defaultTTL: 300000 },
  rateLimit: { windowMs: 60000, maxRequests: 1000 },
  enableMetrics: true,
});

engine.use(corsMiddleware({ origin: '*' }));
engine.use(timingMiddleware());

// دریافت تمام نقل‌قول‌ها (کش‌شده برای 5 دقیقه)
engine.get('/api/quotes', async (req) => {
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { quotes: [] },
  };
}, { cache: { ttl: 300000 } });

// دریافت نقل‌قول تصادفی
engine.get('/api/quotes/random', async (req) => {
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { text: 'نقل‌قول تصادفی' },
  };
}, {
  cache: {
    ttl: 600000,
    key: (req) => 'quote:random',
  },
});

// دریافت نقل‌قول با ID (کش برای هر ID)
engine.get('/api/quotes/:id', async (req) => {
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { id: req.params.id, text: 'متن نقل‌قول...' },
  };
}, {
  cache: {
    ttl: 600000,
    key: (req) => `quote:${req.params.id}`,
  },
});

// ایجاد نقل‌قول جدید
engine.post('/api/quotes', async (req) => {
  const { text, author } = req.body as { text: string; author: string };
  
  // بی‌اعتبار کردن کش لیست
  engine.invalidateCache('quote:*');
  
  return {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
    body: {
      id: Date.now(),
      text,
      author,
      createdAt: new Date().toISOString(),
    },
  };
});

// پاک‌کردن منابع هنگام خاتمه
process.on('SIGINT', () => {
  console.log('خاتمه...');
  engine.destroy();
  process.exit(0);
});
```

## بهترین عملکردها 🏆

1. **کش کنید استراتژیک** — روی داده‌های پر‌خواست، کم‌تغییر
2. **معیارها را نظارت کنید** — هشدارهایی برای افت نرخ کش
3. **قطع مدار را تست کنید** — خرابی‌ها را شبیه‌سازی کنید
4. **منابع را پاک کنید** — `engine.destroy()` را هنگام خاتمه فراخوانی کنید
5. **از Middleware استفاده کنید** — احراز‌هویت، گزارش‌دهی، فشرده‌سازی

## انطباق‌گر Next.js 🚀

```typescript
// app/api/quotes/route.ts
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

## ساختار پروژه 📁

```
tigh/
├── src/
│   ├── engine.ts           # کلاس موتور اصلی
│   ├── index.ts            # export‌های اصلی
│   ├── types.ts            # تعریف‌های TypeScript
│   ├── router.ts           # سیستم مسیریابی
│   ├── cache.ts            # پیاده‌سازی کش LRU
│   ├── rate-limiter.ts     # محدودیت نرخ
│   ├── circuit-breaker.ts  # قطع مدار خودکار
│   ├── middleware.ts       # سیستم middleware
│   ├── metrics.ts          # جمع‌آوری معیارها
│   └── adapter-next.ts     # انطباق‌گر Next.js
├── README.md               # مستندات انگلیسی
├── README_FA.md            # مستندات فارسی
├── USAGE_GUIDE.md          # راهنمای استفاده انگلیسی
├── USAGE_GUIDE_FA.md       # راهنمای استفاده فارسی
├── package.json            # وابستگی‌های پروژه
├── tsconfig.json           # تنظیمات TypeScript
├── LICENSE                 # مجوز MIT
└── .gitignore              # فایل‌های نادیده‌گیری Git
```

## مجوز 📜

MIT - آزادانه برای استفاده برای مقاصد تجاری یا شخصی.

## نویسنده ✍️

ایجاد‌شده توسط [ارسام عدینه](https://github.com/arsamadineh)

## مشارکت 🤝

مشارکت‌ها خوش‌آمد! لطفاً یک issue باز کنید یا pull request ارسال کنید.

## پیوندهای مفید 🔗

- [مستندات TypeScript](https://www.typescriptlang.org/docs)
- [مستندات Next.js](https://nextjs.org/docs)
- [مستندات NPM](https://docs.npmjs.com)

---

ساخته‌شده با ❤️ برای جامعه‌ی فارسی‌زبان
