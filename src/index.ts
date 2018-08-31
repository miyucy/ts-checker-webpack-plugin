import * as webpack from "webpack";
import * as path from "path";
import ts from "typescript";
import * as event from "events";
// https://nodejs.org/api/worker_threads.html
const workerThreads = require("worker_threads");

const NAME = "TsCheckerPlugin";
export default class TsCheckerPlugin {
  exited: boolean = false;
  errors: any[] = [];
  worker: any = null;
  watch: boolean = false;
  event: event.EventEmitter = new event.EventEmitter();

  constructor(options: { tsConfigPath: string; options: object }) {
    this.setupEventHandler();
  }

  apply(compiler: webpack.Compiler) {
    compiler.hooks.run.tapAsync(NAME, (compilation: webpack.compilation.Compilation, callback) => {
      const tsConfigPath = this.resolveTsConfigPath(compiler);
      // console.log(`tsConfigPath = ${tsConfigPath}`);
      this.watch = false;
      this.errors = [];
      this.worker = this.hookWorkerEvents(this.hookWorkerCommonEvents(this.createWorker(tsConfigPath)));
      callback();
    });

    compiler.hooks.watchRun.tapAsync(NAME, (compiler: webpack.Compiler, callback) => {
      const tsConfigPath = this.resolveTsConfigPath(compiler);
      // console.log(`tsConfigPath = ${tsConfigPath}`);
      this.watch = true;
      this.errors = [];
      this.worker = this.hookWatchWorkerEvents(this.hookWorkerCommonEvents(this.createWatchWorker(tsConfigPath)));
      callback();
    });

    compiler.hooks.watchClose.tap(NAME, () => {
      const threadId = this.worker.threadId;
      this.worker.unref();
      this.worker.terminate(() => this.event.emit("worker:terminate", threadId));
      this.worker = null;
    });

    compiler.hooks.done.tapAsync(NAME, (stats: webpack.Stats, callback) => {
      if (this.watch) {
        this.waitForWatchDone(stats, callback);
      } else {
        this.waitForDone(stats, callback);
      }
    });
  }

  resolveTsConfigPath(compiler: webpack.Compiler) {
    const tsConfigPath = compiler.options.context
      ? path.resolve(compiler.options.context, "tsconfig.json")
      : path.resolve("./tsconfig.json");
    return tsConfigPath;
  }

  waitForWatchDone(stats: webpack.Stats, callback) {
    this.event.once("done", () => {
      this.reportErrors(stats);
      callback();
    });
  }

  waitForDone(stats: webpack.Stats, callback) {
    this.event.once("done", () => {
      this.reportErrors(stats);
      callback();
    });
  }

  reportErrors(stats: webpack.Stats) {
    this.errors.forEach(error => stats.compilation.errors.push(new Error(error.message)));
    this.errors = [];
  }

  unrefWorker() {
    if (this.worker) {
      this.worker.unref();
      this.worker = null;
    }
  }

  hookWorkerEvents(worker) {
    worker.on("online", () => this.event.emit("start"));
    worker.on("exit", () => this.event.emit("done"));
    worker.on("error", () => this.event.emit("done"));
    worker.on("message", message => {
      if (message.result === "diagnostics") {
        message.diagnostics.forEach((diagnostic) => {
          this.errors.push(diagnostic);
        });
      }
    });
    return worker;
  }

  hookWatchWorkerEvents(worker) {    
    worker.on("message", message => {
      switch (message.result) {
        case "report":
          const diagnostic: ts.Diagnostic = message.diagnostic;
          // console.log(diagnostic.code, diagnostic.messageText);
          if (diagnostic.code === 6031) {
            // Starting compilation in watch mode...
            this.event.emit("start");
          } else if (diagnostic.code === 6032) {
            // File change detected. Starting incremental compilation...
            this.event.emit("start");
          } else if (diagnostic.code === 6193) { 
            // Found 1 error. Watching for file changes.
            this.event.emit("done");
          } else if (diagnostic.code === 6194) {
            // Found {0} errors. Watching for file changes.
            this.event.emit("done");
          } else {
          }
          break;
        case "diagnostics":
          message.diagnostics.forEach((diagnostic) => {
            this.errors.push(diagnostic);
          });
          break;
      }
    });
    return worker;
  }

  hookWorkerCommonEvents(worker) {
    const threadId = worker.threadId;

    worker.on("online", () => {
      this.event.emit("worker:online", threadId);
    });

    worker.on("exit", exitCode => {
      this.event.emit("worker:exit", [threadId, exitCode]);
    });

    worker.on("error", error => {
      this.event.emit("worker:error", [threadId, error]);
    });

    return worker;
  }

  createWorker(tsConfigPath: string, options: ts.CompilerOptions = {}) {
    const worker = new workerThreads.Worker(path.resolve(__dirname, "worker.js"), {
      workerData: {
        tsConfigPath,
        options
      }
    });
    this.event.emit("worker:new", worker.threadId);
    return worker;
  }

  createWatchWorker(tsConfigPath: string, options: ts.CompilerOptions = {}) {
    const worker = new workerThreads.Worker(path.resolve(__dirname, "watch_worker.js"), {
      workerData: {
        tsConfigPath,
        options
      }
    });
    this.event.emit("worker:new", worker.threadId);
    return worker;
  }

  setupEventHandler() {
    this.event.on("worker:new", threadId => {
      (new Date());
    });
    this.event.on("worker:online", threadId => {
      (new Date());
    });
    this.event.on("worker:exit", ([threadId, exitCode]) => {
      (new Date());
    });
    this.event.on("worker:error", ([threadId, error]) => {
      (new Date());
    });
    this.event.on("worker:terminate", threadId => {
      (new Date());
    });
    this.event.on("start", () => {
      (new Date());
    });
    this.event.on("done", () => {
      (new Date());
    });
  }
}
