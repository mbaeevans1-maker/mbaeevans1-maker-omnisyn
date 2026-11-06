/**
 * Express 4 does not forward rejected promises from async handlers to the error
 * middleware, so a single validation failure inside an async route would crash the
 * process. This guard wraps route handlers so thrown errors and rejected promises are
 * passed to next(err) and answered by the JSON error handler instead.
 */
import { Router } from 'express';

const VERBS = ['get', 'post', 'patch', 'put', 'delete', 'all'];
const proto = Object.getPrototypeOf(Router());

for (const verb of VERBS) {
  const original = proto[verb];
  if (typeof original !== 'function') continue;
  proto[verb] = function patched(path, ...handlers) {
    const wrapped = handlers.map((handler) => {
      if (typeof handler !== 'function') return handler;
      if (handler.length >= 4) return handler; // error middleware keeps its signature
      return function guarded(req, res, next) {
        try {
          const result = handler(req, res, next);
          if (result && typeof result.then === 'function') {
            result.catch(next);
          }
          return result;
        } catch (err) {
          next(err);
          return undefined;
        }
      };
    });
    return original.call(this, path, ...wrapped);
  };
}
