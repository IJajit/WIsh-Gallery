---
name: troubleshooting
description: "Build resilient applications with robust error handling strategies that gracefully handle failures and provide excellent debugging experiences."
---

# Troubleshooting and Error Handling Patterns

Build resilient applications with robust error handling strategies that gracefully handle failures and provide excellent debugging experiences.

## When to Use This Skill

- Implementing error handling in new features
- Designing error-resilient APIs
- Debugging production issues
- Improving application reliability
- Creating better error messages for users and developers
- Implementing retry and circuit breaker patterns
- Handling async/concurrent errors
- Building fault-tolerant distributed systems

## Core Concepts

### 1. Error Handling Philosophies

#### Exceptions vs Result Types:
- **Exceptions:** Traditional try-catch, disrupts control flow.
- **Result Types:** Explicit success/failure, functional approach.
- **Error Codes:** C-style, requires discipline.
- **Option/Maybe Types:** For nullable values.

#### When to Use Each:
- **Exceptions:** Unexpected errors, exceptional conditions.
- **Result Types:** Expected errors, validation failures.
- **Panics/Crashes:** Unrecoverable errors, programming bugs.

### 2. Error Categories

#### Recoverable Errors:
- Network timeouts
- Missing files
- Invalid user input
- API rate limits

#### Unrecoverable Errors:
- Out of memory
- Stack overflow
- Programming bugs (null pointer, etc.)

---

## Best Practices

- **Fail Fast:** Validate input early, fail quickly.
- **Preserve Context:** Include stack traces, metadata, timestamps.
- **Meaningful Messages:** Explain what happened and how to fix it.
- **Log Appropriately:** Error = log, expected failure = don't spam logs.
- **Handle at Right Level:** Catch where you can meaningfully handle.
- **Clean Up Resources:** Use try-finally, context managers, defer.
- **Don't Swallow Errors:** Log or re-throw, don't silently ignore.
- **Type-Safe Errors:** Use typed errors when possible.

### Good Error Handling Example (Python)

```python
def process_order(order_id: str) -> Order:
    """Process order with comprehensive error handling."""
    try:
        # Validate input
        if not order_id:
            raise ValidationError("Order ID is required")

        # Fetch order
        order = db.get_order(order_id)
        if not order:
            raise NotFoundError("Order", order_id)

        # Process payment
        try:
            payment_result = payment_service.charge(order.total)
        except PaymentServiceError as e:
            # Log and wrap external service error
            logger.error(f"Payment failed for order {order_id}: {e}")
            raise ExternalServiceError(
                f"Payment processing failed",
                service="payment_service",
                details={"order_id": order_id, "amount": order.total}
            ) from e

        # Update order
        order.status = "completed"
        order.payment_id = payment_result.id
        db.save(order)

        return order

    except ApplicationError:
        # Re-raise known application errors
        raise
    except Exception as e:
        # Log unexpected errors
        logger.exception(f"Unexpected error processing order {order_id}")
        raise ApplicationError(
            "Order processing failed",
            code="INTERNAL_ERROR"
        ) from e
```

---

## Detailed Patterns & Documentation

Detailed pattern documentation lives in [details.md](references/details.md). Read that file when the navigation tier above is insufficient.

---

## Common Pitfalls

- **Catching Too Broadly:** `except Exception` hides bugs.
- **Empty Catch Blocks:** Silently swallowing errors.
- **Logging and Re-throwing:** Creates duplicate log entries.
- **Not Cleaning Up:** Forgetting to close files, connections.
- **Poor Error Messages:** "Error occurred" is not helpful.
- **Returning Error Codes:** Use exceptions or Result types.
- **Ignoring Async Errors:** Unhandled promise rejections.
