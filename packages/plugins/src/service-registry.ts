/** Simple service locator for dependency injection. */
export class ServiceRegistry {
  private services = new Map<string, unknown>();

  /** Register a service by name. */
  register<T>(name: string, service: T): void {
    this.services.set(name, service);
  }

  /** Retrieve a service by name. Throws if not registered. */
  get<T>(name: string): T {
    if (!this.services.has(name)) {
      throw new Error(`Service "${name}" is not registered`);
    }
    return this.services.get(name) as T;
  }

  /** Check whether a service is registered. */
  has(name: string): boolean {
    return this.services.has(name);
  }
}
