import ts from "typescript";
import { readFile } from "fs";
import { promisify } from "util";
import { dirname } from "path";
import { toDiagnosticError } from "./error";
import * as worker from "worker_threads";
import { logger } from "./logger";

interface WorkerData {
  tsConfigPath: string;
  options: ts.CompilerOptions;
}

const fsReadFile = promisify(readFile);

function parseJsonText(tsConfigPath: string) {
  return fsReadFile(tsConfigPath).then(data => {
    return ts.parseJsonText(tsConfigPath, data.toString("utf-8"));
  });
}

function parseJsonConfig(jsonSourceFile: ts.JsonSourceFile) {
  const tsConfigPath = jsonSourceFile.fileName;
  const basePath = dirname(tsConfigPath);
  const parsedCommandLine = ts.parseJsonSourceFileConfigFileContent(jsonSourceFile, ts.sys, basePath);
  return Promise.resolve({
    ...parsedCommandLine,
    options: {
      ...parsedCommandLine.options,
      project: tsConfigPath
    }
  });
}

function modifyCompilerOptions(options: ts.CompilerOptions): ts.CompilerOptions {
  return {
    ...options,
    noEmit: true
  };
}

function createProgram(parsedCommandLine: ts.ParsedCommandLine) {
  const rootNames = parsedCommandLine.fileNames;
  const options = modifyCompilerOptions(parsedCommandLine.options);
  const projectReferences = parsedCommandLine.projectReferences;
  const host = ts.createCompilerHost(options);
  return Promise.resolve(
    ts.createProgram({
      rootNames,
      options,
      projectReferences,
      host
    })
  );
}

function getDiagnostics(program: ts.Program, emitResult: ts.EmitResult) {
  return [...ts.getPreEmitDiagnostics(program), ...emitResult.diagnostics].filter(Boolean);
}

function run(parentPort: worker.MessagePort | null, workerData: WorkerData) {
  if (!parentPort) {
    return;
  }

  parseJsonText(workerData.tsConfigPath)
    .then(parseJsonConfig)
    .then(createProgram)
    .then(program => [program, program.emit()] as [ts.Program, ts.EmitResult])
    .then(([program, emitResult]) => {
      parentPort.postMessage({
        type: "log",
        payload: ["sourceFiles", program.getSourceFiles().length]
      });
      const diagnostics = getDiagnostics(program, emitResult);
      if (diagnostics.length > 0) {
        Promise.all(diagnostics.map(toDiagnosticError)).then(payload => {
          parentPort.postMessage({
            type: "diagnostics",
            payload
          });
        });
      }
    });
}
run(worker.parentPort, worker.workerData as WorkerData);
