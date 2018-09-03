export default class Waiter {
  p: Promise<any>;
  r: (value: any) => void;

  constructor() {
    this.new = this.new.bind(this);
    this.p = this.new();
  }

  notify(value: any) {
    this.r(value);
  }

  wait(done: any) {
    this.p = this.p.then(done).then(this.new);
  }

  new() {
    return new Promise(resolve => {
      this.r = resolve;
    });
  }
}
