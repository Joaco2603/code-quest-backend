import { Request, Response, NextFunction } from 'express';

type ExpressAsync = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

type AnyAsync<T extends any[] = any[]> = (...args: T) => Promise<unknown>;

/**
 * Wrapper que soporta:
 * - Handlers de Express (req,res,next) -> pasa errores a next
 * - Any async function rethrows the error, so callers can await it.
 */
export const asyncHandler = <F extends AnyAsync | ExpressAsync>(fn: F) => {
  return (...args: Parameters<F>) => {
    const maybeNext = args[2] as unknown as NextFunction | undefined;

    const p = Promise.resolve((fn as any)(...args));

    // When an Express next handler is provided, forward the error to its middleware.
    if (typeof maybeNext === 'function') {
      p.catch(maybeNext);
      return p;
    }

    // For direct calls, such as from a service, rethrow so the caller can handle the error.
    return p.catch((err) => {
      throw err;
    });
  };
};
