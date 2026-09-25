import { AsyncLocalStorage } from 'async_hooks';

export type RequestContextStore = {
  requestId?: string;
  startedAt?: number;
  authFailureReason?: string;
  userId?: string;
  userRole?: string;
  path?: string;
  method?: string;
  ip?: string;
};

const storage = new AsyncLocalStorage<RequestContextStore>();

export const requestContext = {
  run<T>(context: RequestContextStore, callback: () => T): T {
    return storage.run(context, callback);
  },

  get(): RequestContextStore | undefined {
    return storage.getStore();
  },

  set(values: Partial<RequestContextStore>) {
    const store = storage.getStore();
    if (!store) return;

    Object.assign(store, values);
  },
};
