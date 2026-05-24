const fs = require("fs/promises");
const path = require("path");
const { pathToFileURL } = require("url");

const EVENTS_PATH = path.join(__dirname, "events.json");
const TOLERANCE_WEI = 10n ** 15n;

async function readEvents() {
  try {
    const raw = await fs.readFile(EVENTS_PATH, "utf8");
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      throw new Error("events.json must contain an array");
    }

    return parsed;
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw new Error(`Failed to read events.json: ${error.message}`);
  }
}

function parseAmountToWei(amount) {
  const [wholePart, fractionPart = ""] = String(amount).split(".");
  const normalizedFraction = `${fractionPart}000000000000000000`.slice(0, 18);

  return BigInt(wholePart || "0") * 10n ** 18n + BigInt(normalizedFraction);
}

function buildExpectedBalances(events) {
  const balances = new Map();

  for (const event of events) {
    const address = event.address;
    const amountWei = parseAmountToWei(event.amount);
    const current = balances.get(address) ?? 0n;

    if (event.type === "deposit") {
      balances.set(address, current + amountWei);
      continue;
    }

    if (event.type === "withdrawal") {
      balances.set(address, current - amountWei);
    }
  }

  return balances;
}

async function main() {
  const { getBalance } = await import(pathToFileURL(path.join(__dirname, "contractReader.js")).href);
  const events = await readEvents();
  const expectedBalances = buildExpectedBalances(events);

  let mismatchCount = 0;

  for (const [address, expectedWei] of expectedBalances.entries()) {
    const onChain = await getBalance(address);
    const actualWei = BigInt(onChain.balance);
    const difference = expectedWei > actualWei ? expectedWei - actualWei : actualWei - expectedWei;

    if (difference > TOLERANCE_WEI) {
      mismatchCount += 1;
      console.log(
        `MISMATCH for ${address}: expected ${expectedWei.toString()} got ${actualWei.toString()}`,
      );
    }
  }

  if (mismatchCount === 0) {
    console.log("All balances validated successfully");
  }

  console.log(`${expectedBalances.size} addresses checked, ${mismatchCount} mismatches found`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
