import { resolve } from "path";
import ts from "typescript";
import * as webpack from "webpack";
import * as workerThreads from "worker_threads"; // https://nodejs.org/api/worker_threads.html
import { findTsConfig } from "./find_ts_config";
import { logger } from "./logger";
import Waiter from "./waiter";

export default class TsCheckerPlugin {
  static NAME = "TsCheckerPlugin";

  tsConfigPath?: string;
  tsCompilerOptions?: ts.CompilerOptions;
  emitError: boolean = false;

  workerCreatedAt: number = 0;
  workerStartedAt: number = 0;
  workerFinishedAt: number = 0;
  checkerStartedAt: number = 0;
  checkerFinishedAt: number = 0;
  worker: workerThreads.Worker | null = null;
  errors: any[] = [];
  warnings: any[] = [];
  fatalErrors: any[] = [];
  waiter: Waiter = new Waiter();

  constructor(options: { tsConfigPath?: string; options?: ts.CompilerOptions; emitError?: boolean } = {}) {
    this.tsConfigPath = options.tsConfigPath;
    this.tsCompilerOptions = options.options;
    this.emitError = !!options.emitError;
  }

  apply(compiler: webpack.Compiler) {
    compiler.hooks.run.tapAsync(TsCheckerPlugin.NAME, (compilation: webpack.compilation.Compilation, done) => {
      logger.info("run");
      this.resolveTsConfigPath(compiler)
        .then(tsConfigPath => {
          logger.info(`tsConfigPath = ${tsConfigPath}`);
          this.worker = this.hookWorkerEvents(this.createWorker(tsConfigPath));
          done();
        })
        .catch(error => {
          logger.error(error);
          done(error);
        });
    });

    compiler.hooks.watchRun.tapAsync(TsCheckerPlugin.NAME, (compiler: webpack.Compiler, done) => {
      logger.info("watchRun");
      if (this.worker) {
        done();
        return;
      }
      this.resolveTsConfigPath(compiler)
        .then(tsConfigPath => {
          logger.info(`tsConfigPath = ${tsConfigPath}`);
          this.worker = this.hookWorkerEvents(this.createWatchWorker(tsConfigPath));
          done();
        })
        .catch(error => {
          logger.error(error);
          done(error);
        });
    });

    compiler.hooks.done.tapAsync(TsCheckerPlugin.NAME, (stats: webpack.Stats, done) => {
      logger.trace("done");
      this.waiter.wait(() => {
        if (this.fatalErrors.length > 0) {
          this.fatalErrors.forEach(done);
        } else {
          const errors = this.errors.map(error => new Error(error.message));
          const warnings = this.warnings.map(warning => new Error(warning.message));
          errors.forEach(error => stats.compilation.errors.push(error));
          warnings.forEach(warning => stats.compilation.warnings.push(warning));  
          if (this.emitError) {
            done(errors[0]);
          } else {
            done();
          }
        }
        this.errors = [];
        this.warnings = [];
        this.fatalErrors = [];
      });
    });
  }

  hookWorkerEvents(worker: workerThreads.Worker) {
    worker.on("online", () => {
      this.workerStartedAt = Date.now();
      logger.info("Start", `${this.workerStartedAt - this.workerCreatedAt}ms`);
      this.errors = [];
      this.warnings = [];
      this.fatalErrors = [];
    });

    worker.on("exit", exitCode => {
      this.workerFinishedAt = Date.now();
      logger.info("Done", `${this.workerFinishedAt - this.workerStartedAt}ms`);
      this.waiter.notify(true);
    });

    worker.on("error", error => {
      this.fatalErrors.push(error);
      this.waiter.notify(false);
    });

    worker.on("message", message => {
      logger.debug("message", message);
      if (message.type === "log") {
        logger.debug("log", ...message.payload);
      } else if (message.type === "diagnostics") {
        message.payload.forEach(diagnostic => this.registerDiagnotic(diagnostic));
      } else if (message.type === "diagnostic") {
        this.registerDiagnotic(message.payload);
      }
    });

    return worker;
  }

  registerDiagnotic(diagnostic) {
    if (diagnostic.category == ts.DiagnosticCategory.Message) {
      if (diagnostic.code === 6031 || diagnostic.code === 6032) {
        // 6031: Starting compilation in watch mode...
        // 6032: File change detected. Starting incremental compilation...
        this.checkerStartedAt = Date.now();
        logger.info("Start");
        this.errors = [];
        this.warnings = [];
        this.fatalErrors = [];
      } else if (diagnostic.code === 6193 || diagnostic.code === 6194) {
        // 6193: Found 1 error. Watching for file changes.
        // 6194: Found {0} errors. Watching for file changes.
        this.checkerFinishedAt = Date.now();
        logger.info("Done", `${this.checkerFinishedAt - this.checkerStartedAt}ms`);
        this.waiter.notify([this.errors, this.warnings, this.fatalErrors]);
      } else {
        logger.debug("diagnostic", diagnostic);
      }
    } else if (diagnostic.category == ts.DiagnosticCategory.Error) {
      this.errors.push(diagnostic);
    } else {
      this.warnings.push(diagnostic);
    }
  }

  createWorker(tsConfigPath: string, options: ts.CompilerOptions = {}) {
    return this._createWorker("worker.js", tsConfigPath, options);
  }

  createWatchWorker(tsConfigPath: string, options: ts.CompilerOptions = {}) {
    return this._createWorker("watch_worker.js", tsConfigPath, options);
  }

  _createWorker(fileName: string, tsConfigPath: string, options: ts.CompilerOptions = {}) {
    this.workerCreatedAt = Date.now();
    const worker = new workerThreads.Worker(resolve(__dirname, fileName), {
      workerData: {
        tsConfigPath,
        options
      }
    });
    return worker;
  }

  resolveTsConfigPath(compiler: webpack.Compiler) {
    return findTsConfig([this.tsConfigPath, compiler.options.context, "."]);
  }
}
