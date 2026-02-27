// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IKYCRegistry} from "./interfaces/IKYCRegistry.sol";

/// @title KYCRegistry
/// @notice Pluggable whitelist-based KYC registry.
///         The owner (protocol admin or a business) can approve / revoke addresses.
///         Any third-party KYC provider can implement IKYCRegistry and be wired
///         into EquityToken.config.kycProvider.
contract KYCRegistry is Ownable, IKYCRegistry {
    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    mapping(address => bool) private _verified;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event AddressVerified(address indexed account);
    event AddressRevoked(address indexed account);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address owner_) Ownable(owner_) {}

    // -------------------------------------------------------------------------
    // IKYCRegistry
    // -------------------------------------------------------------------------

    function isVerified(address account) external view returns (bool) {
        return _verified[account];
    }

    // -------------------------------------------------------------------------
    // Admin functions
    // -------------------------------------------------------------------------

    /// @notice Mark `account` as KYC verified.
    function verify(address account) external onlyOwner {
        require(account != address(0), "KYCRegistry: zero address");
        _verified[account] = true;
        emit AddressVerified(account);
    }

    /// @notice Batch-verify multiple addresses in one transaction.
    function verifyBatch(address[] calldata accounts) external onlyOwner {
        for (uint256 i = 0; i < accounts.length; i++) {
            require(accounts[i] != address(0), "KYCRegistry: zero address in batch");
            _verified[accounts[i]] = true;
            emit AddressVerified(accounts[i]);
        }
    }

    /// @notice Revoke KYC status from `account`.
    function revoke(address account) external onlyOwner {
        _verified[account] = false;
        emit AddressRevoked(account);
    }
}
