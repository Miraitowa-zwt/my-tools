export class TaskQueue {
  constructor() {
    this.items = [];
    this.running = false;
    this.idleResolvers = [];
  }

  enqueue(taskId, job) {
    this.items.push({ taskId, job });
    void this.runNext();
  }

  async runNext() {
    if (this.running) {
      return;
    }

    const next = this.items.shift();
    if (!next) {
      this.idleResolvers.splice(0).forEach((resolve) => resolve());
      return;
    }

    this.running = true;
    try {
      await next.job();
    } finally {
      this.running = false;
      await this.runNext();
    }
  }

  onIdle() {
    if (!this.running && this.items.length === 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => this.idleResolvers.push(resolve));
  }
}
