import { ethers } from "hardhat";

async function main() {
  const TokenVault = await ethers.getContractFactory("TokenVault");
  const tokenVault = await TokenVault.deploy();
  await tokenVault.waitForDeployment();

  console.log("Contract deployed to: ", tokenVault.target);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
