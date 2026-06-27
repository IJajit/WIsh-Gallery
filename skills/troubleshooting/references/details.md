# Detailed Error Handling & Troubleshooting Patterns

This document details concrete implementation patterns for building fault-tolerant applications.

---

## 1. Retry Pattern

Retrying a failed operation can resolve transient errors (e.g., momentary network drop, rate limiting).

### Best Practices:
- **Limit Retries:** Never retry indefinitely. Use a maximum count (typically 3-5).
- **Exponential Backoff:** Increase wait time exponentially between retries to avoid overwhelming target services.
- **Jitter:** Add random noise to the wait time to prevent thundering herd problems.

### Code Pattern (TypeScript)

```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) {
      throw error;
    }
    // Calculate exponential delay with random jitter (+/- 20%)
    const jitter = (Math.random() - 0.5) * 0.2 * delay;
    const nextDelay = delay + jitter;
    
    console.warn(`Operation failed. Retrying in ${Math.round(nextDelay)}ms... (${retries} retries left)`);
    await new Promise(resolve => setTimeout(resolve, nextDelay));
    return retryWithBackoff(fn, retries - 1, delay * 2);
  }
}
```

---

## 2. Circuit Breaker Pattern

Prevent an application from repeatedly trying to execute an operation that's likely to fail, saving resources and protecting downstream services.

### States:
1. **Closed:** Requests flow normally. Failures are tracked.
2. **Open:** Requests fail immediately with a fast-fail error. A timeout timer starts.
3. **Half-Open:** A limited number of trial requests are sent. If they succeed, return to **Closed** state; if any fail, revert to **Open** state.

---

## 3. Async/Concurrent Error Handling

Ensure async processes do not crash the application or run unmonitored.

### Best Practices:
- **Always catch Promises:** Every promise chain must terminate with a `.catch()` block or be wrapped in `try-catch` inside `async/await`.
- **Unhandled Rejections:** Register handlers for unhandled promise rejections at the application entry point.

### Node.js Example:
```javascript
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Perform graceful shutdown if necessary
});
```
