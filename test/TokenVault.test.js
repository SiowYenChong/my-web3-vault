const { expect } = require("chai");
const { ethers } = require("hardhat");
const solc = require("solc");

describe("TokenVault", function () {
  async function deployVaultFixture() {
    const [owner, user, otherUser] = await ethers.getSigners();
    const TokenVault = await ethers.getContractFactory("TokenVault");
    const vault = await TokenVault.deploy();
    await vault.waitForDeployment();

    return { vault, owner, user, otherUser };
  }

  it("records a 1 ETH deposit correctly", async function () {
    const { vault, user } = await deployVaultFixture();

    await vault.connect(user).deposit({ value: ethers.parseEther("1") });

    expect(await vault.getBalance(user.address)).to.equal(ethers.parseEther("1"));
  });

  it("allows a user to withdraw their balance and receive ETH", async function () {
    const { vault, user } = await deployVaultFixture();
    const depositAmount = ethers.parseEther("1");

    await vault.connect(user).deposit({ value: depositAmount });

    await expect(() => vault.connect(user).withdraw(depositAmount)).to.changeEtherBalance(
      user,
      depositAmount,
    );

    expect(await vault.getBalance(user.address)).to.equal(0n);
  });

  it("reverts when withdrawing more than deposited", async function () {
    const { vault, user } = await deployVaultFixture();

    await vault.connect(user).deposit({ value: ethers.parseEther("1") });

    await expect(vault.connect(user).withdraw(ethers.parseEther("1.1"))).to.be.revertedWith(
      "Insufficient balance",
    );
  });

  it("reverts when a zero-balance user tries to withdraw", async function () {
    const { vault, otherUser } = await deployVaultFixture();

    await expect(vault.connect(otherUser).withdraw(ethers.parseEther("0.1"))).to.be.revertedWith(
      "Insufficient balance",
    );
  });

  it("blocks a reentrancy attack attempt", async function () {
    const { vault } = await deployVaultFixture();

    const attackerSource = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ITokenVault {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
    function getBalance(address account) external view returns (uint256);
}

contract ReentrancyAttacker {
    ITokenVault public vault;
    bool public reenterSucceeded;
    bool private attempted;

    constructor(address _vault) {
        vault = ITokenVault(_vault);
    }

    function attack() external payable {
        vault.deposit{value: msg.value}();
        vault.withdraw(msg.value);
    }

    receive() external payable {
        if (!attempted) {
            attempted = true;
            (bool ok, ) = address(vault).call(
                abi.encodeWithSignature("withdraw(uint256)", msg.value)
            );
            reenterSucceeded = ok;
        }
    }
}
`;

    const input = {
      language: "Solidity",
      sources: {
        "ReentrancyAttacker.sol": {
          content: attackerSource,
        },
      },
      settings: {
        outputSelection: {
          "*": {
            "*": ["abi", "evm.bytecode.object"],
          },
        },
      },
    };

    const output = JSON.parse(solc.compile(JSON.stringify(input)));
    if (output.errors) {
      const fatalError = output.errors.find((e) => e.severity === "error");
      if (fatalError) {
        throw new Error(fatalError.formattedMessage);
      }
    }

    const compiled = output.contracts["ReentrancyAttacker.sol"].ReentrancyAttacker;
    const [deployer] = await ethers.getSigners();
    const factory = new ethers.ContractFactory(compiled.abi, compiled.evm.bytecode.object, deployer);
    const attacker = await factory.deploy(vault.target);
    await attacker.waitForDeployment();

    await attacker.attack({ value: ethers.parseEther("1") });

    expect(await attacker.reenterSucceeded()).to.equal(false);
    expect(await vault.getBalance(attacker.target)).to.equal(0n);
  });
});
