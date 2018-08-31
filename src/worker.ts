import ts from "typescript";
import * as fs from "fs";
import * as util from "util";
import * as path from "path";
import toError from "./to_error";
const worker = require("worker_threads");

interface WorkerData {
  tsConfigPath: string;
  options: ts.CompilerOptions;
}

function parseJsonText(tsConfigPath: string) {
  const fsReadFile = util.promisify(fs.readFile);
  return fsReadFile(tsConfigPath).then(data => {
    return ts.parseJsonText(tsConfigPath, data.toString("utf-8"));
  });
}

function parseJsonConfig(jsonSourceFile: ts.JsonSourceFile) {
  const tsConfigPath = jsonSourceFile.fileName;
  const basePath = path.dirname(tsConfigPath);
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

function run(workerData: WorkerData) {
  parseJsonText(workerData.tsConfigPath)
    .then(parseJsonConfig)
    .then(createProgram)
    .then(program => {
      const diagnostics = getDiagnostics(program, program.emit());
      if (diagnostics.length > 0) {
        worker.parentPort.postMessage({
          result: "diagnostics",
          diagnostics: diagnostics.map(toError)
        });
      } else {
        worker.parentPort.postMessage({
          result: "success"
        });
      }
    })
    .catch(error => {
      worker.parentPort.postMessage({
        result: "error",
        error
      });
    });
}
run(worker.workerData);
