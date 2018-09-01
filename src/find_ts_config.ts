import * as path from "path";
import * as fs from "fs";
import * as util from "util";

const fsStat = util.promisify(fs.stat);

export async function findTsConfig(names: (string | null | undefined)[]) {
  for (const name of names) {
    if (name && name.length > 0) {
      try {
        return await getTsConfigPath(path.normalize(name));
      } catch {}
    }
  }
  throw new Error("tsconfig.json does not found.");
}

async function getTsConfigPath(pathToDirOrFile: string): Promise<string> {
    const stats = await fsStat(pathToDirOrFile);
    if (stats.isFile()) {
        return pathToDirOrFile;
    } else if (stats.isDirectory()) {
        return getTsConfigPath(path.resolve(pathToDirOrFile, "tsconfig.json"));
    } else {
        throw new Error("tsconfig.json does not found.");
    }
}

// resolveTsConfigPath(compiler: webpack.Compiler) {
//     const fsStat = promisify(fs.stat);
//     //
//     //(path, callback)
//     if (this.tsConfigPath) {
//       path.normalize(this.tsConfigPath);
//     }
//     const tsConfigPath = compiler.options.context
//       ? path.resolve(compiler.options.context, "tsconfig.json")
//       : path.resolve("./tsconfig.json");
//     return tsConfigPath;
//   }
