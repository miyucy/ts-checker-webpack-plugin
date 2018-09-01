import ts from "typescript";
import { readFile } from "fs";
import { promisify } from "util";


export interface DiagnosticError {
  category: ts.DiagnosticCategory;
  code: number;
  message: string;
  fileName?: string;
  line?: number;
  character?: number;
  length?: number;
}

const fsReadFile = promisify(readFile);

export async function toDiagnosticError(diagnostic: ts.Diagnostic) {
  const error: DiagnosticError = {
    category: diagnostic.category,
    code: diagnostic.code,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n") + "\n"
  };

  if (diagnostic.file) {
    const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start!);
    const prefix = `${diagnostic.file.fileName}:${line + 1}:${character + 1}`;
    error.line = line;
    error.character = character;
    error.length = diagnostic.length;
    error.fileName = diagnostic.file.fileName;
    error.message = prefix + "\n" + error.message;
  }

  if (error.fileName && error.line && error.character && error.length) {
    try {
      const suffix = await createSuffix(error.fileName, error.line, error.character, error.length);
      error.message = error.message + "\n" + suffix;
    } catch (e) {
    }
  }

  return error;
}

function createSuffix(fileName: string, line: number, character: number, length: number) {
  return fsReadFile(fileName, { encoding: "utf-8" }).then(contents => (
    [...contents.split("\n"), ""][line] + "\n" + " ".repeat(character) + "^".repeat(length) + "\n"
  ));
}
