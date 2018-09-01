import ts from "typescript";
import { toDiagnosticError } from "./error";
import * as worker from "worker_threads";
import Queue from "./queue";

interface WorkerData {
  tsConfigPath: string;
  options: ts.CompilerOptions;
}

function modifyCompilerOptions(options: ts.CompilerOptions, tsConfigPath: string): ts.CompilerOptions {
  return {
    ...options,
    noEmit: true,
    project: tsConfigPath
  };
}

function reportDiagnostic(queue: Queue, parentPort: worker.MessagePort, diagnostic: ts.Diagnostic) {
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

function reportWatchStatus(
  queue: Queue,
  parentPort: worker.MessagePort,
  diagnostic: ts.Diagnostic,
  newLine: string,
  options: ts.CompilerOptions
) {
  queue.add(() =>
    toDiagnosticError(diagnostic)
      .then(payload =>
        parentPort.postMessage({
          type: "report",
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

function createWatchProgram(parentPort: worker.MessagePort | null, args: WorkerData) {
  if (!parentPort) {
    return;
  }
  const queue = new Queue();
  ts.createWatchProgram(
    ts.createWatchCompilerHost(
      args.tsConfigPath,
      modifyCompilerOptions(args.options, args.tsConfigPath),
      ts.sys,
      ts.createSemanticDiagnosticsBuilderProgram,
      reportDiagnostic.bind(null, queue, parentPort),
      reportWatchStatus.bind(null, queue, parentPort)
    )
  );
}
createWatchProgram(worker.parentPort, worker.workerData as WorkerData);
