// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IEquityToken} from "./interfaces/IEquityToken.sol";
import {IKYCRegistry} from "./interfaces/IKYCRegistry.sol";

/// @title EquityToken
/// @notice EOC equity token standard — a non-transferable, non-burnable ERC-20
///         derivative representing a real equity stake in a company.
///
/// Key properties:
///  - Peer-to-peer transfers are disabled; tokens can only move through
///    whitelisted exchange contracts.
///  - Burning is disabled (equity cannot be destroyed).
///  - Optional per-wallet max ownership cap to prevent whale dominance.
///  - Optional KYC gate: only KYC-verified wallets can receive tokens.
///  - Configuration (circuit breaker params, KYC, limits) is stored here and
///    read by the exchange when enforcing trading rules.
contract EquityToken is ERC20, Ownable, IEquityToken {
    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    uint256 private immutable _maxSupply;

    Config private _config;

    /// @notice Exchanges allowed to call transferFrom on behalf of holders
    mapping(address => bool) private _whitelistedExchanges;

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /// @param name_       Token name (e.g. "Acme Corp Equity")
    /// @param symbol_     Token symbol (e.g. "ACME")
    /// @param maxSupply_  Hard cap on total tokens that can ever be minted
    /// @param owner_      Company / deployer address that owns this contract
    /// @param cfg         Initial regulatory configuration
    constructor(
        string memory name_,
        string memory symbol_,
        uint256 maxSupply_,
        address owner_,
        Config memory cfg
    ) ERC20(name_, symbol_) Ownable(owner_) {
        require(maxSupply_ > 0, "EquityToken: maxSupply must be > 0");
        _maxSupply = maxSupply_;
        _setConfig(cfg);
    }

    // -------------------------------------------------------------------------
    // IEquityToken view functions
    // -------------------------------------------------------------------------

    function maxSupply() external view returns (uint256) {
        return _maxSupply;
    }

    function config() external view returns (Config memory) {
        return _config;
    }

    function isWhitelistedExchange(address exchange) external view returns (bool) {
        return _whitelistedExchanges[exchange];
    }

    // -------------------------------------------------------------------------
    // Owner functions
    // -------------------------------------------------------------------------

    /// @notice Mint new equity tokens to `to`. Cannot exceed maxSupply.
    function mint(address to, uint256 amount) external onlyOwner {
        require(totalSupply() + amount <= _maxSupply, "EquityToken: exceeds max supply");
        _mint(to, amount);
        emit TokensMinted(to, amount);
    }

    /// @notice Allow `exchange` to call transferFrom for trading.
    function whitelistExchange(address exchange) external onlyOwner {
        require(exchange != address(0), "EquityToken: zero address");
        _whitelistedExchanges[exchange] = true;
        emit ExchangeWhitelisted(exchange);
    }

    /// @notice Remove `exchange` from the whitelist.
    function removeExchange(address exchange) external onlyOwner {
        _whitelistedExchanges[exchange] = false;
        emit ExchangeRemovedFromWhitelist(exchange);
    }

    /// @notice Update regulatory configuration. Only owner for now;
    ///         governance can be wired here in v2.
    function updateConfig(Config calldata newConfig) external onlyOwner {
        _setConfig(newConfig);
        emit ConfigUpdated(newConfig);
    }

    // -------------------------------------------------------------------------
    // ERC-20 overrides — enforce equity constraints
    // -------------------------------------------------------------------------

    /// @dev Whitelisted exchanges may call transfer() to send equity from their own reserves.
    ///      All other callers are rejected — equity is not a peer-to-peer currency.
    function transfer(address to, uint256 amount) public override returns (bool) {
        require(_whitelistedExchanges[msg.sender], "EquityToken: direct transfers disabled, use the exchange");
        _applyReceiveChecks(to, amount);
        return super.transfer(to, amount);
    }

    /// @dev Only whitelisted exchanges may pull tokens on behalf of holders
    ///      (standard approve + transferFrom flow used for sells / LP operations).
    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        require(_whitelistedExchanges[msg.sender], "EquityToken: caller is not a whitelisted exchange");
        _applyReceiveChecks(to, amount);

        return super.transferFrom(from, to, amount);
    }

    /// @dev Burning is permanently disabled for equity tokens.
    function burn(uint256) public pure {
        revert("EquityToken: burning disabled");
    }

    /// @dev Burning is permanently disabled for equity tokens.
    function burnFrom(address, uint256) public pure {
        revert("EquityToken: burning disabled");
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    /// @dev Shared receive-side checks: KYC and max ownership.
    ///      Whitelisted exchange contracts are exempt — they hold tokens as pool
    ///      reserves, not as individual investors.
    function _applyReceiveChecks(address to, uint256 amount) internal view {
        if (to == address(0)) return;
        if (_whitelistedExchanges[to]) return; // exchange reserves are exempt

        if (_config.kycRequired) {
            require(_config.kycProvider != address(0), "EquityToken: KYC provider not set");
            require(
                IKYCRegistry(_config.kycProvider).isVerified(to),
                "EquityToken: recipient not KYC verified"
            );
        }

        if (_config.limitOwnership) {
            uint256 newBalance = balanceOf(to) + amount;
            uint256 maxAllowed = (totalSupply() * _config.maxOwnershipPct) / 100;
            require(newBalance <= maxAllowed, "EquityToken: exceeds max ownership limit");
        }
    }

    function _setConfig(Config memory cfg) internal {
        require(cfg.upperCircuitPct > 0 && cfg.upperCircuitPct <= 100, "EquityToken: invalid upperCircuitPct");
        require(cfg.lowerCircuitPct > 0 && cfg.lowerCircuitPct <= 100, "EquityToken: invalid lowerCircuitPct");
        require(cfg.circuitHaltBlocks > 0, "EquityToken: circuitHaltBlocks must be > 0");
        if (cfg.limitOwnership) {
            require(cfg.maxOwnershipPct > 0 && cfg.maxOwnershipPct <= 100, "EquityToken: invalid maxOwnershipPct");
        }
        if (cfg.kycRequired) {
            require(cfg.kycProvider != address(0), "EquityToken: KYC provider required");
        }
        _config = cfg;
    }
}
