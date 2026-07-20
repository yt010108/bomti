import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

function requiredNpmCli(): string {
  const value = process.env.npm_execpath;
  if (!value) throw new Error("NPM_EXEC_PATH_REQUIRED");
  return value;
}

const npmCli = requiredNpmCli();

const laneReceiptSchema = z.object({
  verdict: z.enum(["pass", "fail"]),
  profile: z.string(),
  payloadCommand: z.array(z.string()),
  payloadExitCode: z.number().int().nullable(),
  failureCode: z.string().nullable(),
  nestedReceipt: z.string().nullable()
});

export type LaneResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export async function runLane(
  repository: string,
  sha: string,
  wrapperOutput: string,
  payload: string[],
  extraEnvironment: Readonly<Record<string, string>> = {}
): Promise<LaneResult> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [npmCli, "run", "evidence:lane", "--", "--out", wrapperOutput, "--sha", sha, "--", ...payload],
      {
        cwd: repository,
        encoding: "utf8",
        env: { ...process.env, ...extraEnvironment }
      },
      (error, stdout, stderr) => {
        resolve({
          exitCode: typeof error?.code === "number" ? error.code : error ? 1 : 0,
          stdout,
          stderr
        });
      }
    );
  });
}

export async function readLaneReceipt(wrapperOutput: string) {
  const parsedReceipt: unknown = JSON.parse(await readFile(path.join(wrapperOutput, "result.json"), "utf8"));
  return laneReceiptSchema.parse(parsedReceipt);
}
