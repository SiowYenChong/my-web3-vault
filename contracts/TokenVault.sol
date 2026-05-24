// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title TokenVault
/// @notice A simple ETH vault that supports user deposits and withdrawals.
contract TokenVault {
    /// @notice Tracks each user's ETH balance held in the vault.
    mapping(address => uint256) private balances;

    /// @notice Reentrancy lock state.
    bool private locked;

    /// @notice Emitted when a user deposits ETH into the vault.
    /// @param who Address of the user who deposited ETH.
    /// @param amount Amount of ETH deposited.
    event Deposit(address indexed who, uint256 amount);

    /// @notice Emitted when a user withdraws ETH from the vault.
    /// @param who Address of the user who withdrew ETH.
    /// @param amount Amount of ETH withdrawn.
    event Withdrawal(address indexed who, uint256 amount);

    /// @notice Prevents reentrant calls to protected functions.
    modifier nonReentrant() {
        require(!locked, "Reentrancy blocked");
        locked = true;
        _;
        locked = false;
    }

    /// @notice Deposits ETH into the vault and credits the sender's balance.
    function deposit() external payable {
        require(msg.value > 0, "Deposit must be > 0");
        balances[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value);
    }

    /// @notice Withdraws a specified amount of ETH from the sender's vault balance.
    /// @param amount Amount of ETH to withdraw.
    function withdraw(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be > 0");
        require(balances[msg.sender] >= amount, "Insufficient balance");

        balances[msg.sender] -= amount;

        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        require(sent, "ETH transfer failed");

        emit Withdrawal(msg.sender, amount);
    }

    /// @notice Returns the ETH balance held in the vault for a given user.
    /// @param account Address of the user to query.
    /// @return The current vault balance of the provided address.
    function getBalance(address account) external view returns (uint256) {
        return balances[account];
    }
}
