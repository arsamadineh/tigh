# تیغ - راهنمای راه‌اندازی و استقرار

## خلاصه

**تیغ (Tigh)** یک موتور API سبک‌وزن و قابل ترکیب برای TypeScript است که با توانایی‌های جامع مسیریابی، کش‌کردن، محدودیت نرخ، قطع مدار خودکار و معیارهای عملکردی ارائه می‌شود.

## شروع سریع

### نصب
```bash
npm install tigh
```

### مثال ساده
```typescript
import { Tigh } from 'tigh';

const engine = new Tigh();

engine.get('/api/hello', async (req) => {
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { message: 'سلام، جهان!' },
  };
});

const response = await engine.handle('GET', '/api/hello', {
  method: 'GET',
  path: '/api/hello',
  headers: {},
  query: {},
  params: {},
  timestamp: Date.now(),
});

console.log(response);
```

## ساختار پروژه

```
tigh/
├── src/                          # کد منبع TypeScript
│   ├── engine.ts                 # کلاس موتور اصلی
│   ├── types.ts                  # تعریف‌های TypeScript
│   ├── router.ts                 # سیستم مسیریابی تریه‌ای
│   ├── cache.ts                  # پیاده‌سازی کش LRU
│   ├── rate-limiter.ts           # محدودیت نرخ (3 استراتژی)
│   ├── circuit-breaker.ts        # قطع مدار خودکار
│   ├── middleware.ts             # سیستم middleware
│   ├── metrics.ts                # جمع‌آوری معیارها
│   ├── adapter-next.ts           # انطباق‌گر Next.js
│   └── index.ts                  # export‌های اصلی
│
├── dist/                         # خروجی TypeScript (پس از ساخت)
│
├── مستندات فارسی                  # برای کاربران فارسی‌زبان
│   ├── README_FA.md              # مستندات اصلی
│   ├── USAGE_GUIDE_FA.md         # راهنمای استفاده
│   ├── CONTRIBUTING_FA.md        # راهنمای سهم‌گذاری
│   ├── CODE_OF_CONDUCT_FA.md    # قانون رفتار
│   └── CHANGELOG_FA.md           # تاریخچه تغییرات
│
├── English Documentation
│   ├── README.md
│   ├── USAGE_GUIDE.md
│   ├── CONTRIBUTING.md
│   ├── CODE_OF_CONDUCT.md
│   └── CHANGELOG.md
│
├── Configuration Files
│   ├── package.json              # وابستگی‌ها و اسکریپت‌ها
│   ├── tsconfig.json             # تنظیمات TypeScript
│   ├── .gitignore                # فایل‌های Git Ignore
│   └── LICENSE                   # مجوز MIT
│
└── این فایل (SETUP.md)
```

## راه‌اندازی توسعه

### نصب وابستگی‌ها
```bash
cd /home/arsam/Documents/work/api/tigh
npm install
```

### ساخت پروژه
```bash
npm run build
```

### بررسی انواع TypeScript
```bash
npm run typecheck
```

## ویژگی‌های اصلی

### 1. مسیریابی سریع
- مسیریابی تریه‌ای برای عملکرد O(n) که n تعداد پارامترهای مسیر است
- پارامترهای نام‌دار: `/users/:id`
- مسیرهای وایلدکارد: `/static/*`

### 2. کش‌کردن LRU
- حداکثر 10000 آیتم (قابل‌پیکربندی)
- TTL قابل‌تنظیم برای هر مسیر
- بی‌اعتبارسازی الگو: `engine.invalidateCache('pattern:*')`

### 3. محدودیت نرخ
- Token Bucket (پیش‌فرض) - صاف و کارآمد
- Sliding Window - دقیق‌تر
- Fixed Window - سریع‌تر
- پیش‌فرض: 100 درخواست در 60 ثانیه

### 4. قطع مدار خودکار
- تشخیص خرابی و بازیابی خودکار
- سه حالت: Closed → Open → Half-Open
- پیش‌فرض: بازشدن بعد از 5 خرابی

### 5. Middleware سلسله‌ای
- CORS دارالتحریر
- Timing (X-Response-Time)
- Compression (Gzip)
- سفارشی‌سازی کامل

### 6. معیارهای جامع
- کل درخواست‌ها، توزیع بر روی Method/Status/Path
- صدک‌های تأخیر: P50، P90، P95، P99
- آمار کش: Hit Rate، Memory Usage
- وضعیت قطع مدار

## استفاده برای کاربران فارسی‌زبان

### مستندات موجود
تمام مستندات در **دو زبان** ارائه شده‌اند:

**فارسی:**
- `README_FA.md` - شروع سریع و مرجع کامل
- `USAGE_GUIDE_FA.md` - راهنمای تفصیلی با مثال‌های فارسی
- `CONTRIBUTING_FA.md` - نحوه سهم‌گذاری
- `CODE_OF_CONDUCT_FA.md` - رفتار جامعه

**English:**
- `README.md`
- `USAGE_GUIDE.md`
- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`

### منابع اضافی
- `SECURITY.md` - نکات امنیتی
- `CHANGELOG.md` - تاریخچه تغییرات

## لینک‌های مهم

### GitHub
- **Repository**: https://github.com/arsamadineh/tigh
- **Release**: v0.0.1-beta
- **Issues**: برای گزارش باگ و پیشنهادات

### بهترین‌های استفاده
1. کش کردن استراتژیک روی داده‌های کم‌تغییر
2. معیارها را نظارت کنید برای تشخیص مشکلات
3. قطع مدار را در تولید فعال کنید
4. از HTTPS در تولید استفاده کنید
5. منابع را هنگام خاتمه پاک کنید: `engine.destroy()`

## مثال کامل استفاده

```typescript
import { Tigh, corsMiddleware, timingMiddleware } from 'tigh';

// ایجاد موتور
const engine = new Tigh({
  cache: { maxSize: 5000, defaultTTL: 300000 },
  rateLimit: { windowMs: 60000, maxRequests: 1000 },
  enableMetrics: true,
});

// افزودن Middleware
engine.use(corsMiddleware({ origin: '*' }));
engine.use(timingMiddleware());

// تعریف مسیرها
engine.get('/api/quotes', async (req) => {
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { quotes: [] },
  };
}, { cache: { ttl: 300000 } });

engine.post('/api/quotes', async (req) => {
  const { text } = req.body as { text: string };
  engine.invalidateCache('quote:*');
  return {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
    body: { id: Date.now(), text },
  };
});

// نظارت بر معیارها
setInterval(() => {
  const metrics = engine.flushMetrics();
  console.log(`نرخ کش: ${(metrics.cache.hitRate * 100).toFixed(2)}%`);
}, 30000);

// پاک‌کردن منابع
process.on('SIGINT', () => {
  engine.destroy();
  process.exit(0);
});
```

## مرحله بعدی

### برای استفاده‌کنندگان
1. مستندات فارسی را بخوانید: `README_FA.md`
2. راهنمای استفاده را دنبال کنید: `USAGE_GUIDE_FA.md`
3. مثال‌های عملی را امتحان کنید

### برای توسعه‌دهندگان
1. Repository را Fork کنید
2. شاخه جدید ایجاد کنید برای ویژگی‌های جدید
3. مستندات را ارائه دهید
4. Pull Request را باز کنید

### برای نگهداری
1. معیارها را نظارت کنید
2. آپدیت‌های امنیتی را دنبال کنید
3. بازخوردها را جمع‌آوری کنید

## تماس و پشتیبانی

- **GitHub Issues**: برای باگ‌ها و پیشنهادات
- **Discussions**: برای سؤالات و بحث‌های عمومی
- **Security**: برای مسائل امنیتی، لطفاً مستقیماً تماس بگیرید

## مجوز

تیغ تحت مجوز MIT منتشر شده است. برای جزئیات بیشتر `LICENSE` را ببینید.

## تشکر

تشکر بر علاقه‌مندی شما به تیغ! ما از سهم‌گذاری‌های شما استقبال می‌کنیم.

---

ساخته‌شده برای جامعه‌ی فارسی‌زبان
آخرین به‌روزرسانی: 2026-07-06
