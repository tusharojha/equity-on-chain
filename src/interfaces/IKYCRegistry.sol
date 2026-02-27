// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IKYCRegistry
/// @notice Interface for KYC verification providers
interface IKYCRegistry {
    /// @notice Returns true if the given address has passed KYC verification
    function isVerified(address account) external view returns (bool);
}
