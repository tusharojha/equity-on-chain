// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EquityToken} from "./EquityToken.sol";
import {IEquityToken} from "./interfaces/IEquityToken.sol";
import {EquityExchange} from "./EquityExchange.sol";

/// @title EquityFactory
/// @notice One-click deployment: creates an EquityToken, whitelists the exchange,
///         and lists it with initial liquidity — all in a single transaction.
///
/// Atomic flow inside `create()`:
///   1. Deploy EquityToken with factory as temporary owner.
///   2. Mint `initialEquity` tokens to this factory (for seeding the pool).
///   3. Mint `founderTokens` directly to msg.sender (founder allocation).
///   4. Whitelist the EquityExchange on the new token.
///   5. Transfer token ownership to msg.sender (the company).
///   6. Approve exchange to pull initialEquity from factory and call listToken.
contract EquityFactory is Ownable {
    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    EquityExchange public immutable exchange;

    address[] public deployedTokens;
    mapping(address => address[]) public tokensDeployedBy;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event EquityCreated(
        address indexed token,
        address indexed founder,
        string name,
        string symbol,
        uint256 maxSupply,
        uint256 founderTokens,
        uint256 poolTokens,
        uint256 initialBnb
    );

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address owner_, address payable exchange_) Ownable(owner_) {
        require(exchange_ != address(0), "EquityFactory: zero exchange");
        exchange = EquityExchange(exchange_);
    }

    // -------------------------------------------------------------------------
    // Core
    // -------------------------------------------------------------------------

    /// @notice Deploy a new EquityToken and list it on the exchange atomically.
    ///
    /// @param name_          Token name  (e.g. "Acme Corp")
    /// @param symbol_        Token symbol (e.g. "ACME")
    /// @param maxSupply_     Hard supply cap (total tokens that can ever exist)
    /// @param poolTokens     Tokens deposited into the initial liquidity pool
    /// @param founderTokens  Tokens minted directly to msg.sender (founder allocation)
    /// @param cfg            Regulatory configuration (circuit breakers, KYC, …)
    ///
    /// msg.value must satisfy: msg.value > exchange.listingFee()
    /// The surplus (msg.value - listingFee) becomes the initial BNB in the pool.
    function create(
        string calldata name_,
        string calldata symbol_,
        uint256 maxSupply_,
        uint256 poolTokens,
        uint256 founderTokens,
        IEquityToken.Config calldata cfg
    ) external payable returns (address tokenAddress) {
        require(poolTokens > 0, "EquityFactory: poolTokens must be > 0");
        require(poolTokens + founderTokens <= maxSupply_, "EquityFactory: mint exceeds maxSupply");
        require(msg.value > exchange.listingFee(), "EquityFactory: need listingFee + initial BNB");

        // ── 1. Deploy token with factory as temporary owner ──────────────────
        EquityToken token = new EquityToken(name_, symbol_, maxSupply_, address(this), cfg);
        tokenAddress = address(token);

        // ── 2. Mint pool tokens to this factory (will be transferred to exchange) ──
        token.mint(address(this), poolTokens);

        // ── 3. Mint founder allocation directly to caller ────────────────────
        //      _mint bypasses transfer restrictions — founders receive tokens
        //      as initial allocation, not via a transfer.
        if (founderTokens > 0) {
            token.mint(msg.sender, founderTokens);
        }

        // ── 4. Whitelist the exchange ─────────────────────────────────────────
        token.whitelistExchange(address(exchange));

        // ── 5. Transfer token ownership to the founder / company ─────────────
        token.transferOwnership(msg.sender);

        // ── 6. Approve exchange to pull poolTokens, then list ─────────────────
        token.approve(address(exchange), poolTokens);
        exchange.listToken{value: msg.value}(tokenAddress, poolTokens);

        // ── 7. Record deployment ──────────────────────────────────────────────
        deployedTokens.push(tokenAddress);
        tokensDeployedBy[msg.sender].push(tokenAddress);

        uint256 initialBnb = msg.value - exchange.listingFee();
        emit EquityCreated(tokenAddress, msg.sender, name_, symbol_, maxSupply_, founderTokens, poolTokens, initialBnb);
    }

    // -------------------------------------------------------------------------
    // View helpers
    // -------------------------------------------------------------------------

    function deployedTokenCount() external view returns (uint256) {
        return deployedTokens.length;
    }

    function getTokensByFounder(address founder) external view returns (address[] memory) {
        return tokensDeployedBy[founder];
    }
}
