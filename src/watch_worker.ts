// https://nodejs.org/api/worker_threads.html
import ts from "typescript";
import toError from "./to_error";
const worker = require("worker_threads");

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

function reportDiagnostic(diagnostic: ts.Diagnostic) {
  worker.parentPort.postMessage({
    result: "diagnostics",
    diagnostics: [diagnostic].map(toError)
  });
}

function reportWatchStatus(diagnostic: ts.Diagnostic, newLine: string, options: ts.CompilerOptions) {
  worker.parentPort.postMessage({
    result: "report",
    diagnostic
  });
}

function createWatchProgram(args: WorkerData) {
  ts.createWatchProgram(
    ts.createWatchCompilerHost(
      args.tsConfigPath,
      modifyCompilerOptions(args.options, args.tsConfigPath),
      ts.sys,
      ts.createSemanticDiagnosticsBuilderProgram,
      reportDiagnostic,
      reportWatchStatus
    )
  );
}

createWatchProgram(worker.workerData);
