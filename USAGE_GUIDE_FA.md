# راهنمای استفاده تیغ (Tigh Usage Guide)

## فهرست مطالب
1. [نصب](#نصب)
2. [راه‌اندازی](#راه‌اندازی)
3. [مسیریابی](#مسیریابی)
4. [کش‌کردن](#کش‌کردن)
5. [محدودیت نرخ](#محدودیت-نرخ)
6. [Middleware](#middleware)
7. [قطع مدار](#قطع-مدار)
8. [معیارها](#معیارها)
9. [مثال کامل](#مثال-کامل)

## نصب

```bash
npm install tigh
# یا
yarn add tigh
# یا
pnpm add tigh
```

## راه‌اندازی

```typescript
import { Tigh } from 'tigh';

// موتور با تنظیمات پیش‌فرض
const engine = new Tigh();

// یا با تنظیمات سفارشی
const engine = new Tigh({
  enableCache: true,
  enableRateLimit: true,
  enableMetrics: true,
  enableCircuitBreaker: true,
  cache: {
    maxSize: 5000,
    defaultTTL: 60000,
  },
  rateLimit: {
    windowMs: 60000,
    maxRequests: 100,
    strategy: 'token-bucket',
  },
});
```

## مسیریابی

### مسیرهای ساده

```typescript
// درخواست GET
engine.get('/api/quotes', async (req) => {
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { quotes: [] },
  };
});

// درخواست POST
engine.post('/api/quotes', async (req) => {
  const { text, author } = req.body as { text: string; author: string };
  return {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
    body: { id: 1, text, author },
  };
});

// درخواست PUT
engine.put('/api/quotes/:id', async (req) => {
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { id: req.params.id, updated: true },
  };
});

// درخواست DELETE
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
engine.get('/api/posts/:postId/comments/:commentId', async (req) => {
  const { postId, commentId } = req.params;
  
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      postId,
      commentId,
      text: 'نظر عالی!',
    },
  };
});
```

### مسیرهای وایلدکارد

```typescript
// مسیر catch-all برای فایل‌های ایستا
engine.get('/static/*', async (req) => {
  const filePath = req.params['*']; // مثال: 'css/style.css'
  
  return {
    status: 200,
    headers: { 'Content-Type': 'text/css' },
    body: '/* محتوای CSS */',
  };
});
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

// مثال: GET /api/search?q=سلام&limit=20
```

## کش‌کردن

### فعال‌کردن کش روی مسیرها

```typescript
engine.get(
  '/api/config',
  async (req) => {
    // یک عملیات پرهزینه
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
    const profile = await fetchUserProfile(req.params.userId);
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: profile,
    };
  },
  {
    cache: {
      ttl: 300000, // 5 دقیقه
      key: (req) => `user:${req.params.userId}:profile`,
    },
  }
);
```

### بی‌اعتبارسازی کش

```typescript
// بی‌اعتبار کردن تمام کش‌های کاربر
engine.invalidateCache('user:*:profile');

// بی‌اعتبار کردن کش خاص
engine.invalidateCache('user:123:profile');
```

### سرصحفه‌های کش

```
X-Cache: HIT    // از کش سرو شد
X-Cache: MISS   // کش‌نشده، تازه تولید شد
```

## محدودیت نرخ

### محدودیت نرخ جهانی

```typescript
const engine = new Tigh({
  rateLimit: {
    windowMs: 60000,        // پنجره 1 دقیقه‌ای
    maxRequests: 100,       // 100 درخواست در هر پنجره
    strategy: 'token-bucket', // استراتژی Token Bucket
  },
});
```

### کلید محدودیت نرخ سفارشی

```typescript
const engine = new Tigh({
  rateLimit: {
    windowMs: 60000,
    maxRequests: 1000,
    strategy: 'token-bucket',
    keyGenerator: (req) => {
      // محدودیت بر اساس شناسه کاربر یا IP
      return req.headers['x-user-id'] || req.ip || 'anonymous';
    },
  },
});
```

### استراتژی‌های محدودیت نرخ

```typescript
// Token Bucket - محدودیت صاف، امکان انفجار
const engine = new Tigh({
  rateLimit: { strategy: 'token-bucket' },
});

// Sliding Window - دقیق‌تر ولی حافظه بیشتر
const engine = new Tigh({
  rateLimit: { strategy: 'sliding-window' },
});

// Fixed Window - سریع ولی مستعد مشکل مرز
const engine = new Tigh({
  rateLimit: { strategy: 'fixed-window' },
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

## Middleware

### Middleware دارالتحریر

```typescript
import { corsMiddleware, timingMiddleware, compressMiddleware } from 'tigh';

// CORS middleware
engine.use(corsMiddleware({
  origin: ['https://example.com', 'https://app.example.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  headers: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

// Middleware زمان‌بندی
engine.use(timingMiddleware());

// Middleware فشرده‌سازی
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
  
  // تأیید توکن و اتصال به درخواست
  const user = verifyToken(token);
  req.body = { ...req.body, user };
  
  return next();
});

// Middleware گزارش‌دهی
engine.use(async (req, next) => {
  console.log(`→ ${req.method} ${req.path}`);
  const start = performance.now();
  
  const res = await next();
  
  const duration = performance.now() - start;
  console.log(`← ${res.status} (${duration.toFixed(2)}ms)`);
  
  return res;
});

// Middleware مدیریت خطا
engine.use(async (req, next) => {
  try {
    return await next();
  } catch (error) {
    console.error('خطای درخواست:', error);
    
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'خطای داخلی سرور' },
    };
  }
});
```

### ترتیب Middleware

Middleware به ترتیبی که ثبت شده‌اند اجرا می‌شوند:

```typescript
engine.use(corsMiddleware(...));          // 1: مدیریت CORS
engine.use(authMiddleware(...));          // 2: احراز‌هویت
engine.use(loggingMiddleware(...));       // 3: گزارش‌دهی
engine.use(compressionMiddleware(...));   // 4: فشرده‌سازی

// سپس handler مسیر اجرا می‌شود
```

## قطع مدار

### پیکربندی

```typescript
const engine = new Tigh({
  circuitBreaker: {
    failureThreshold: 5,      // باز کردن بعد از 5 خرابی
    recoveryTimeout: 30000,   // تلاش برای بازیابی بعد از 30 ثانیه
    halfOpenMaxAttempts: 3,   // 3 تلاش در حالت نیم‌باز
    monitoringPeriod: 60000,  // نظارت بر مدت 60 ثانیه
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

Headers:
Retry-After: 25
```

## معیارها

### جمع‌آوری معیارها

```typescript
// دریافت عکس‌العمل معیارهای فعلی
const metrics = engine.flushMetrics();

// معیارهای درخواست
console.log(metrics.requests.total);              // 1000
console.log(metrics.requests.byMethod.GET);       // 750
console.log(metrics.requests.byStatus['200']);    // 950

// صدک‌های تأخیر
console.log(metrics.latency.p50);   // 10ms
console.log(metrics.latency.p95);   // 50ms
console.log(metrics.latency.p99);   // 100ms
console.log(metrics.latency.avg);   // 20ms

// معیارهای کش
console.log(metrics.cache.hits);     // 500
console.log(metrics.cache.misses);   // 100
console.log(metrics.cache.hitRate);  // 0.833 (83.3%)
console.log(metrics.cache.size);     // 2500 entry
console.log(metrics.cache.memoryBytes); // ~10MB

// معیارهای محدودیت نرخ
console.log(metrics.rateLimit.totalRequests); // 1000
console.log(metrics.rateLimit.rejected);      // 25

// معیارهای قطع مدار
console.log(metrics.circuitBreaker.state);      // 'closed'
console.log(metrics.circuitBreaker.failures);   // 2
console.log(metrics.circuitBreaker.totalTrips); // 0

// زمان فعال بودن
console.log(metrics.uptime);    // 3600000 (1 ساعت)
```

### داشبورد نظارتی

```typescript
// جمع‌آوری دوره‌ای معیارها
setInterval(() => {
  const metrics = engine.flushMetrics();
  
  // ارسال به سیستم نظارتی
  sendToMonitoring({
    'requests.total': metrics.requests.total,
    'latency.p99': metrics.latency.p99,
    'cache.hitRate': metrics.cache.hitRate,
    'circuitBreaker.state': metrics.circuitBreaker.state,
  });
  
  console.log(`
    کل درخواست‌ها: ${metrics.requests.total}
    نرخ کش: ${(metrics.cache.hitRate * 100).toFixed(2)}%
    تأخیر P99: ${metrics.latency.p99.toFixed(2)}ms
    وضعیت قطع مدار: ${metrics.circuitBreaker.state}
  `);
}, 10000);
```

## مثال کامل

سرور API کامل برای نقل‌قول‌ها:

```typescript
import { Tigh, corsMiddleware, timingMiddleware } from 'tigh';

const engine = new Tigh({
  cache: { maxSize: 10000, defaultTTL: 300000 },
  rateLimit: { windowMs: 60000, maxRequests: 1000, strategy: 'token-bucket' },
  enableMetrics: true,
  enableCircuitBreaker: true,
});

// Middleware‌ها
engine.use(corsMiddleware({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  headers: ['Content-Type', 'Authorization'],
}));

engine.use(timingMiddleware());

// GET /api/quotes - دریافت تمام نقل‌قول‌ها (کش‌شده برای 5 دقیقه)
engine.get('/api/quotes', async (req) => {
  const page = parseInt(req.query.page || '1');
  const limit = parseInt(req.query.limit || '10');
  
  const quotes = [
    { id: 1, text: 'زندگی آن است که اتفاق می‌افتد...' },
    { id: 2, text: 'آینده به کسانی تعلق دارد...' },
  ];
  
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      data: quotes.slice((page - 1) * limit, page * limit),
      page,
      limit,
      total: quotes.length,
    },
  };
}, {
  cache: { ttl: 300000 },
});

// GET /api/quotes/random - نقل‌قول تصادفی (کش‌شده برای 10 دقیقه)
engine.get('/api/quotes/random', async (req) => {
  const quotes = [{ id: 1, text: 'زندگی آن است که اتفاق می‌افتد...' }];
  const random = quotes[Math.floor(Math.random() * quotes.length)];
  
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: random,
  };
}, {
  cache: {
    ttl: 600000,
    key: (req) => 'quote:random',
  },
});

// GET /api/quotes/:id - دریافت نقل‌قول با ID (کش برای هر ID)
engine.get('/api/quotes/:id', async (req) => {
  const id = parseInt(req.params.id);
  const quote = { id, text: `نقل‌قول ${id}` };
  
  if (!quote) {
    return {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'یافت نشد' },
    };
  }
  
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: quote,
  };
}, {
  cache: {
    ttl: 600000,
    key: (req) => `quote:${req.params.id}`,
  },
});

// POST /api/quotes - ایجاد نقل‌قول جدید
engine.post('/api/quotes', async (req) => {
  const { text, author } = req.body as { text: string; author: string };
  
  if (!text) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'متن الزامی است' },
    };
  }
  
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

// مدیریت درخواست‌های ورودی
async function handleRequest(method: string, path: string) {
  const response = await engine.handle(method as any, path, {
    method: method as any,
    path,
    headers: { 'content-type': 'application/json' },
    query: {},
    params: {},
    timestamp: Date.now(),
  });
  
  return response;
}

// گزارش‌دهی دوره‌ای معیارها
setInterval(() => {
  const metrics = engine.flushMetrics();
  console.log(`
    === معیارها ===
    کل درخواست‌ها: ${metrics.requests.total}
    نرخ موفقیت کش: ${(metrics.cache.hitRate * 100).toFixed(2)}%
    تأخیر P99: ${metrics.latency.p99.toFixed(2)}ms
    درخواست‌های رد‌شده: ${metrics.rateLimit.rejected}
  `);
}, 30000);

// پاک‌کردن منابع هنگام خاتمه
process.on('SIGINT', () => {
  console.log('خاتمه...');
  engine.destroy();
  process.exit(0);
});
```

## بهترین عملکردها

1. **کش کردن استراتژیک** — روی داده‌های پر‌خواست، کم‌تغییر
2. **TTL‌های مناسب** — تعادل بین تازگی و عملکرد
3. **نظارت بر معیارها** — هشدار برای افت نرخ کش، افزایش تأخیر
4. **تنظیم محدودیت نرخ** — محافظت از سوء‌استفاده و شکست‌های متوالی
5. **تست قطع مدار** — خرابی‌ها را شبیه‌سازی کنید
6. **پاک‌کردن منابع** — `engine.destroy()` را فراخوانی کنید
7. **استفاده از Middleware** — احراز‌هویت، گزارش‌دهی، فشرده‌سازی

## عیب‌یابی

**کش کار نمی‌کند؟**
- بررسی کنید `enableCache: true` در تنظیمات
- تأیید کنید مسیر گزینه `cache` داشته باشد
- کلید کش را با تابع `key` سفارشی چک کنید

**محدودیت نرخ خیلی سخت است؟**
- `maxRequests` یا `windowMs` را تنظیم کنید
- استراتژی را به `token-bucket` تغییر دهید
- `keyGenerator` سفارشی برای محدودیت‌های هر کاربر

**قطع مدار بیش‌از حد باز می‌شود؟**
- `failureThreshold` را افزایش دهید
- `recoveryTimeout` را افزایش دهید
- سلامت سرویس اساسی را بررسی کنید

**مصرف حافظه بالا است؟**
- `cache.maxSize` را کاهش دهید
- `cache.defaultTTL` را کاهش دهید
- `metrics.cache.memoryBytes` را نظارت کنید
