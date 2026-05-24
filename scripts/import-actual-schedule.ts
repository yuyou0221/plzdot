import "dotenv/config";

import path from "node:path";
import { prisma } from "../src/lib/db/prisma";
import { importActualSchedulePayload } from "../src/lib/schedule-import/actual-schedule-import";

const payloadPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(".local", "actual-run-20260522", "project-task-estimates-v5.json");

async function main() {
  const result = await importActualSchedulePayload(payloadPath);
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
