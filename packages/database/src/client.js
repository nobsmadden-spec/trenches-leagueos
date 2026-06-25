import { PrismaClient } from "@prisma/client";

const globalKey = Symbol.for("trenches.prisma");

export function prismaClient() {
  if (!globalThis[globalKey]) {
    globalThis[globalKey] = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
    });
  }
  return globalThis[globalKey];
}
