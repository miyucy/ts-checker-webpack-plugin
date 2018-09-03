import ts from "typescript";
import * as workerThreads from "worker_threads";
import { toDiagnosticError } from "./error";
import Queue from "./queue";

interface WorkerData {
  tsConfigPath: string;
  options: ts.CompilerOptions;
}

function modifyCompilerOptions(options: ts.CompilerOptions, tsConfigPath: string): ts.CompilerOptions {
  return {
    ...options,
    noEmit: true
  };
}

function reportDiagnostic(queue: Queue, parentPort: workerThreads.MessagePort, diagnostic: ts.Diagnostic) {
  queue.add(() =>
    toDiagnosticError(diagnostic)
      .then(payload =>
        parentPort.postMessage({
          type: "diagnostic",
          payload
        })
      )
      .catch(error =>
        parentPort.postMessage({
          type: "log",
          payload: ["error", error]
        })
      )
  );
}

function createWatchProgram(parentPort: workerThreads.MessagePort | null, args: WorkerData) {
  if (!parentPort) {
    return;
  }
  const queue = new Queue();
  const reporter = reportDiagnostic.bind(null, queue, parentPort);
  ts.createWatchProgram(
    ts.createWatchCompilerHost(
      args.tsConfigPath,
      modifyCompilerOptions(args.options, args.tsConfigPath),
      ts.sys,
      ts.createSemanticDiagnosticsBuilderProgram,
      reporter,
      reporter
    )
  );
}
createWatchProgram(workerThreads.parentPort, workerThreads.workerData as WorkerData);
