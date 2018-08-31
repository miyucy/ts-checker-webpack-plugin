import ts from "typescript";
import { readFileSync } from "fs";

interface DiagnosticError {
  category: ts.DiagnosticCategory;
  code: number;
  message: string;
  fileName?: string;
  line?: number;
  character?: number;
  length?: number;
}

export default function toError(diagnostic: ts.Diagnostic): DiagnosticError {
  const error: DiagnosticError = {
    category: diagnostic.category,
    code: diagnostic.code,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
  };

  if (diagnostic.file) {
    const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start!);
    const prefix = `${diagnostic.file.fileName}:${line + 1}:${character + 1}`;
    const suffix = readFile(diagnostic.file.fileName, line, character, diagnostic.length!);
    error.message = prefix + "\n" + error.message + "\n\n" + suffix + "\n";
    error.line = line;
    error.character = character;
    error.length = diagnostic.length;
    error.fileName = diagnostic.file.fileName;
  }

  return error;
}

function readFile(fileName: string, line: number, character: number, length: number) {
  const results: string[] = [];
  const lines = [...readFileSync(fileName, { encoding: "utf-8" }).split("\n"), ""];
  results.push(lines[line]);
  results.push(" ".repeat(character) + "^".repeat(length));
  return results.join("\n");
}
