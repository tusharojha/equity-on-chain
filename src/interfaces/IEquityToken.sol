// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IEquityToken
/// @notice Interface for EOC equity tokens
interface IEquityToken {
    // -------------------------------------------------------------------------
    // Structs
    // -------------------------------------------------------------------------

    struct Config {
        // Circuit breaker — percentage bounds before halting (e.g., 10 = 10%)
        uint8 upperCircuitPct;
        uint8 lowerCircuitPct;
        // How many blocks trading stays halted after a circuit break
        uint256 circuitHaltBlocks;
        // Max ownership per wallet as percentage of total supply (e.g., 10 = 10%)
        bool limitOwnership;
        uint8 maxOwnershipPct;
        // KYC enforcement
        bool kycRequired;
        address kycProvider;
    }

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event ExchangeWhitelisted(address indexed exchange);
    event ExchangeRemovedFromWhitelist(address indexed exchange);
    event ConfigUpdated(Config newConfig);
    event TokensMinted(address indexed to, uint256 amount);

    // -------------------------------------------------------------------------
    // View functions
    // -------------------------------------------------------------------------

    function maxSupply() external view returns (uint256);
    function config() external view returns (Config memory);
    function isWhitelistedExchange(address exchange) external view returns (bool);

    // -------------------------------------------------------------------------
    // Owner functions
    // -------------------------------------------------------------------------

    function mint(address to, uint256 amount) external;
    function whitelistExchange(address exchange) external;
    function removeExchange(address exchange) external;
    function updateConfig(Config calldata newConfig) external;
}
