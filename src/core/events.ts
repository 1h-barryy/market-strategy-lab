type Handler<T> = (payload: T) => void;

/** Minimal typed event emitter. `on` returns an unsubscribe function. */
export class Emitter<Events extends object> {
  private readonly handlers = new Map<keyof Events, Set<Handler<never>>>();

  on<K extends keyof Events>(type: K, handler: Handler<Events[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(handler as Handler<never>);
    return () => set.delete(handler as Handler<never>);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    for (const handler of this.handlers.get(type) ?? []) (handler as Handler<Events[K]>)(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}
