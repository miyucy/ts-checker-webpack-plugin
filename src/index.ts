import { EventEmitter } from "events";
import { resolve } from "path";
import ts from "typescript";
import * as webpack from "webpack";
import * as workerThreads from "worker_threads"; // https://nodejs.org/api/worker_threads.html
import { findTsConfig } from "./find_ts_config";
import { logger } from "./logger";

const NAME = "TsCheckerPlugin";
export default class TsCheckerPlugin {
  exited: boolean = false;
  errors: any[] = [];
  worker: workerThreads.Worker | null = null;
  watch: boolean = false;
  event: EventEmitter = new EventEmitter();
  tsConfigPath?: string;
  tsCompilerOptions?: ts.CompilerOptions;

  constructor(options: { tsConfigPath?: string; options?: ts.CompilerOptions } = {}) {
    this.tsConfigPath = options.tsConfigPath;
    this.tsCompilerOptions = options.options;
    this.setupEventHandler();
  }

  apply(compiler: webpack.Compiler) {
    compiler.hooks.run.tapAsync(NAME, (compilation: webpack.compilation.Compilation, callback) => {
      this.watch = false;
      this.errors = [];
      this.resolveTsConfigPath(compiler)
        .then(tsConfigPath => {
          logger.info("tsConfigPath = ", tsConfigPath);
          this.worker = this.hookWorkerEvents(this.hookWorkerCommonEvents(this.createWorker(tsConfigPath)));
          callback();
        })
        .catch(error => {
          logger.error(error);
          callback();
        });
    });

    compiler.hooks.watchRun.tapAsync(NAME, (compiler: webpack.Compiler, callback) => {
      this.watch = true;
      this.errors = [];
      if (this.worker) {
        callback();
        return;
      }
      this.resolveTsConfigPath(compiler)
        .then(tsConfigPath => {
          logger.info("tsConfigPath = ", tsConfigPath);
          this.worker = this.hookWatchWorkerEvents(this.hookWorkerCommonEvents(this.createWatchWorker(tsConfigPath)));
          callback();
        })
        .catch(error => {
          logger.error(error);
          callback();
        });
    });

    compiler.hooks.watchClose.tap(NAME, () => {
      logger.debug("watchClose");
      if (this.worker) {
        const threadId = this.worker.threadId;
        this.worker.unref();
        this.worker.terminate(() => this.event.emit("worker:terminate", threadId));
      }
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
    return findTsConfig([this.tsConfigPath, compiler.options.context, "."]);
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

  hookWorkerEvents(worker: workerThreads.Worker) {
    worker.on("online", () => this.event.emit("start"));
    worker.on("exit", () => this.event.emit("done"));
    worker.on("error", () => this.event.emit("done"));
    worker.on("message", message => {
      if (message.type === "log") {
        logger.debug("log", ...message.payload);
      } else if (message.type === "diagnostics") {
        message.payload.forEach(diagnostic => {
          this.errors.push(diagnostic);
        });
      }
    });
    return worker;
  }

  hookWatchWorkerEvents(worker) {
    worker.on("message", message => {
      if (message.type === "log") {
        logger.debug("log", ...message.payload);
      } else if (message.type === "diagnostic") {
        this.errors.push(message.payload);
      } else if (message.type === "report") {
        const diagnostic: ts.Diagnostic = message.payload;
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
    return this._createWorker("worker.js", tsConfigPath, options);
  }

  createWatchWorker(tsConfigPath: string, options: ts.CompilerOptions = {}) {
    return this._createWorker("watch_worker.js", tsConfigPath, options);
  }

  private _createWorker(fileName: string, tsConfigPath: string, options: ts.CompilerOptions = {}) {
    const worker = new workerThreads.Worker(resolve(__dirname, fileName), {
      workerData: {
        tsConfigPath,
        options
      }
    });
    this.event.emit("worker:new", worker.threadId);
    return worker;
  }

  setupEventHandler() {
    const t: any = {};
    this.event.on("worker:new", threadId => {
      t.new = Date.now();
      logger.debug("worker:new");
    });
    this.event.on("worker:online", threadId => {
      t.online = Date.now();
      logger.debug("worker:online", `online - new = ${t.online - t.new}ms`);
    });
    this.event.on("worker:exit", ([threadId, exitCode]) => {
      logger.debug("worker:exit", "exitCode = ", exitCode);
    });
    this.event.on("worker:error", ([threadId, error]) => {
      logger.info("worker:error", error);
    });
    this.event.on("worker:terminate", threadId => {
      logger.debug("worker:terminate");
    });
    this.event.on("start", () => {
      t.start = Date.now();
      logger.info("Start");
    });
    this.event.on("done", () => {
      t.done = Date.now();
      logger.info("Done", `${t.done - t.start}ms`);
    });
  }
}
