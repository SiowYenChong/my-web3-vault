import { ethers } from "ethers";
import dotenv from "dotenv";
import { access, readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const { CONTRACT_ADDRESS, RPC_URL } = process.env;

const abi = [
  "event Deposit(address indexed who, uint256 amount)",
  "event Withdrawal(address indexed who, uint256 amount)",
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const eventsPath = path.join(__dirname, "events.json");

let provider = null;
let contract = null;
let reconnectTimer = null;
let running = false;
let reconnecting = false;

async function ensureEventsFile() {
  try {
    await access(eventsPath);
  } catch {
    await writeFile(eventsPath, "[]", "utf8");
  }
}

async function appendEvent(entry) {
  await ensureEventsFile();

  const raw = await readFile(eventsPath, "utf8");
  const events = JSON.parse(raw);
  events.push(entry);

  await writeFile(eventsPath, JSON.stringify(events, null, 2), "utf8");
}

async function handleEvent(type, address, amount) {
  const formattedAmount = ethers.formatEther(amount);
  const timestamp = new Date().toISOString();

  if (type === "deposit") {
    console.log(`Deposit from ${address}: ${formattedAmount} ETH`);
  } else {
    console.log(`Withdrawal from ${address}: ${formattedAmount} ETH`);
  }

  await appendEvent({
    type,
    address,
    amount: formattedAmount,
    timestamp,
  });
}

function cleanupConnections() {
  if (contract) {
    contract.removeAllListeners();
  }

  if (provider) {
    provider.removeAllListeners();
    if (typeof provider.destroy === "function") {
      provider.destroy();
    }
  }

  contract = null;
  provider = null;
}

function scheduleReconnect() {
  if (!running || reconnecting || reconnectTimer) {
    return;
  }

  reconnecting = true;
  cleanupConnections();

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    reconnecting = false;

    if (!running) {
      return;
    }

    try {
      await connect();
    } catch (error) {
      console.error(`Reconnect failed: ${error.message}`);
      scheduleReconnect();
    }
  }, 5000);
}

async function connect() {
  if (!RPC_URL) {
    throw new Error("RPC_URL is not set");
  }

  if (!CONTRACT_ADDRESS) {
    throw new Error("CONTRACT_ADDRESS is not set");
  }

  await ensureEventsFile();

  provider = new ethers.JsonRpcProvider(RPC_URL);
  contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);

  contract.on("Deposit", async (who, amount) => {
    try {
      await handleEvent("deposit", who, amount);
    } catch (error) {
      console.error(`Failed to persist deposit event: ${error.message}`);
    }
  });

  contract.on("Withdrawal", async (who, amount) => {
    try {
      await handleEvent("withdrawal", who, amount);
    } catch (error) {
      console.error(`Failed to persist withdrawal event: ${error.message}`);
    }
  });

  provider.on("error", (error) => {
    console.error(`Provider error: ${error.message}`);
    scheduleReconnect();
  });

  provider.on("disconnect", () => {
    console.error("Provider disconnected");
    scheduleReconnect();
  });
}

export async function start() {
  if (running) {
    return;
  }

  running = true;

  try {
    await connect();
  } catch (error) {
    running = false;
    throw new Error(`Failed to start listener: ${error.message}`);
  }
}

export function stop() {
  running = false;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  reconnecting = false;
  cleanupConnections();
}
