import * as weblog from "webpack-log";

interface Logger {
    trace(...args: any[]): void;
    debug(...args: any[]): void;
    info(...args: any[]): void;
    warn(...args: any[]): void;
    error(...args: any[]): void;
}

export const logger: Logger = weblog.default({ name: "typechecker" });
