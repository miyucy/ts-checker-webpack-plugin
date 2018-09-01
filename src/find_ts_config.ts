import { stat } from "fs";
import { normalize, resolve } from "path";
import { promisify } from "util";

const fsStat = promisify(stat);

export async function findTsConfig(names: (string | null | undefined)[]) {
  for (const name of names) {
    if (name && name.length > 0) {
      try {
        return await getTsConfigPath(normalize(name));
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
    return getTsConfigPath(resolve(pathToDirOrFile, "tsconfig.json"));
  } else {
    throw new Error("tsconfig.json does not found.");
  }
}
