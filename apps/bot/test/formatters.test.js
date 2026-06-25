import test from "node:test";
import assert from "node:assert/strict";
import { standingsFields } from "../src/formatters.js";

test("Discord standings formatter preserves division order and records", () => {
  const fields = standingsFields({
    "AFC East": [
      { name: "Buffalo Bills", wins: 8, losses: 2, ties: 0 },
      { name: "Miami Dolphins", wins: 7, losses: 3, ties: 0 }
    ]
  });
  assert.equal(fields[0].name, "AFC East");
  assert.match(fields[0].value, /1\. \*\*Buffalo Bills\*\* 8-2/);
  assert.match(fields[0].value, /2\. \*\*Miami Dolphins\*\* 7-3/);
});
