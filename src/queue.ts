export default class Queue {
  private q: Promise<any>;
  constructor() {
    this.q = Promise.resolve();
  }
  add(job) {
    this.q = this.q.then(job);
  }
}
