const { ethers } = require("ethers");
const dotenv = require("dotenv");

dotenv.config();

const { CONTRACT_ADDRESS, RPC_URL } = process.env;

const abi = [
  "function getBalance(address) view returns (uint256)",
];

async function getBalance(walletAddress) {
  try {
    if (!RPC_URL) {
      throw new Error("RPC_URL is not set");
    }

    if (!CONTRACT_ADDRESS) {
      throw new Error("CONTRACT_ADDRESS is not set");
    }

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);
    const result = await contract.getBalance(walletAddress);

    return {
      address: walletAddress,
      balance: result.toString(),
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    throw new Error(`Failed to read balance from TokenVault: ${error.message}`);
  }
}

module.exports = { getBalance };
