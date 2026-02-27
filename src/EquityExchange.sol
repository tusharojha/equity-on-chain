// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IEquityToken} from "./interfaces/IEquityToken.sol";

/// @title EquityExchange
/// @notice AMM exchange for EOC equity tokens paired with native BNB.
///
/// Architecture (constant-product AMM  x*y = k):
///  - Each listed equity token has its own liquidity pool: (equityReserve, bnbReserve).
///  - The pool owner seeds the initial liquidity; additional LPs can join.
///  - Trading is governed by the equity token's on-chain config:
///      • Circuit breaker: modelled after real stock-market circuit breakers.
///        A 24-hour price window is maintained. If any trade moves the price
///        beyond ±X% from the window's reference price, trading halts for
///        `circuitHaltBlocks` blocks. When the halt expires, a NEW reference
///        price is set at the current pool price and the 24-hour window restarts,
///        so circuit protection resumes immediately from the new reference.
///      • Time window: price reference resets every 24 hours (BSC Testnet
///        block time ≈ 3 s/block, so 24 h ≈ 28_800 blocks).
///
/// Fee structure (applied on sells / equity → BNB swaps):
///  - Short-term (held < SHORT_TERM_BLOCKS): 0.45 %
///  - Long-term  (held ≥ SHORT_TERM_BLOCKS): 0.02 %
///  Fee is split: LP_FEE_SHARE to LPs, remainder to protocol treasury.
///
/// Non-transferable equity tokens are moved via approve + transferFrom,
/// where the exchange is the approved spender (a whitelisted exchange address).
contract EquityExchange is Ownable, ReentrancyGuard {
    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @dev BSC Testnet block time ≈ 3 s  →  6 months ≈ 180 * 86_400 / 3 = 5_184_000 blocks
    uint256 public constant SHORT_TERM_BLOCKS = 5_184_000;

    /// @dev 24-hour window in blocks (BSC Testnet, ~3 s/block: 86_400 / 3 = 28_800)
    uint256 public constant WINDOW_BLOCKS = 28_800;

    /// @dev Fee denominator (basis-point-like, using 10_000 = 100%)
    uint256 public constant FEE_DENOM = 10_000;

    /// @dev Short-term sell fee: 0.45 %
    uint256 public constant SHORT_TERM_FEE_BPS = 45;

    /// @dev Long-term sell fee: 0.02 %
    uint256 public constant LONG_TERM_FEE_BPS = 2;

    /// @dev Share of fees that goes to LPs vs treasury (80 / 20 split)
    uint256 public constant LP_FEE_SHARE_BPS = 8_000; // 80 %

    // -------------------------------------------------------------------------
    // Structs
    // -------------------------------------------------------------------------

    struct Pool {
        uint256 equityReserve;
        uint256 bnbReserve;
        // LP tracking
        uint256 totalLPShares;
        mapping(address => uint256) lpShares;
        mapping(address => uint256) lpBnbFees;   // accumulated BNB fees per LP
        // Circuit-breaker state
        uint256 refPriceNumerator;   // bnbReserve   at window start (scaled)
        uint256 refPriceDenominator; // equityReserve at window start (scaled)
        uint256 windowStartBlock;
        bool circuitBroken;
        uint256 haltedUntilBlock;
        // Accumulated protocol fees
        uint256 protocolFeesAccrued;
        bool exists;
    }

    struct HoldRecord {
        // Weighted-average acquisition block for each holder per token
        uint256 weightedBlockSum; // sum of (amount * acquisitionBlock)
        uint256 totalAmount;      // current balance tracked here (mirrors token balance)
    }

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice Protocol treasury — receives protocol fee share
    address public treasury;

    /// @notice Fixed listing fee in BNB (wei)
    uint256 public listingFee;

    using SafeERC20 for IERC20;

    /// @notice token → Pool
    mapping(address => Pool) private _pools;

    /// @notice All listed token addresses (for enumeration)
    address[] public listedTokens;

    /// @notice token → holder → HoldRecord (for fee tier calculation)
    mapping(address => mapping(address => HoldRecord)) private _holdRecords;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event TokenListed(address indexed token, uint256 initialEquity, uint256 initialBnb);
    event LiquidityAdded(address indexed token, address indexed provider, uint256 equity, uint256 bnb, uint256 lpShares);
    event LiquidityRemoved(address indexed token, address indexed provider, uint256 equity, uint256 bnb, uint256 lpShares);
    event TokensBought(address indexed token, address indexed buyer, uint256 bnbIn, uint256 equityOut, uint256 fee);
    event TokensSold(address indexed token, address indexed seller, uint256 equityIn, uint256 bnbOut, uint256 fee);
    event CircuitBreaked(address indexed token, uint256 triggerBlock, uint256 resumeBlock, bool isUpper);
    event WindowReset(address indexed token, uint256 block_, uint256 newPriceNum, uint256 newPriceDenom);
    event ProtocolFeesWithdrawn(address indexed token, address indexed to, uint256 amount);
    event TreasuryUpdated(address newTreasury);
    event ListingFeeUpdated(uint256 newFee);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address owner_, address treasury_, uint256 listingFee_) Ownable(owner_) {
        require(treasury_ != address(0), "EquityExchange: zero treasury");
        treasury = treasury_;
        listingFee = listingFee_;
    }

    // -------------------------------------------------------------------------
    // Listing
    // -------------------------------------------------------------------------

    /// @notice List an equity token and seed the initial liquidity pool.
    ///         Caller must:
    ///           1. Have approved this exchange on the equity token (for `initialEquity`).
    ///           2. Send `listingFee + initialBnb` in msg.value.
    ///         The equity token must have whitelisted this exchange address.
    /// @param token          Address of the EquityToken contract
    /// @param initialEquity  Amount of equity tokens to seed the pool
    function listToken(address token, uint256 initialEquity) external payable nonReentrant {
        require(token != address(0), "EquityExchange: zero address");
        Pool storage pool = _pools[token];
        require(!pool.exists, "EquityExchange: already listed");
        require(initialEquity > 0, "EquityExchange: equity must be > 0");
        require(msg.value > listingFee, "EquityExchange: insufficient BNB (listing fee + initial liquidity)");

        uint256 initialBnb = msg.value - listingFee;
        require(initialBnb > 0, "EquityExchange: no BNB for initial liquidity");

        // Transfer listing fee to treasury
        if (listingFee > 0) {
            _sendBnb(treasury, listingFee);
        }

        // Pull equity tokens from msg.sender into this contract
        IERC20(token).safeTransferFrom(msg.sender, address(this), initialEquity);

        // Initialise pool
        pool.exists = true;
        pool.equityReserve = initialEquity;
        pool.bnbReserve = initialBnb;
        pool.totalLPShares = initialEquity; // bootstrap: LP shares = initial equity
        pool.lpShares[msg.sender] = initialEquity;
        pool.refPriceNumerator = initialBnb;
        pool.refPriceDenominator = initialEquity;
        pool.windowStartBlock = block.number;

        listedTokens.push(token);

        emit TokenListed(token, initialEquity, initialBnb);
        emit LiquidityAdded(token, msg.sender, initialEquity, initialBnb, initialEquity);
    }

    // -------------------------------------------------------------------------
    // Liquidity management
    // -------------------------------------------------------------------------

    /// @notice Add liquidity proportionally to an existing pool.
    ///         Caller sends BNB and the matching equity amount is pulled.
    /// @param token          Listed equity token
    /// @param equityDesired  Max equity tokens to contribute
    function addLiquidity(address token, uint256 equityDesired) external payable nonReentrant {
        Pool storage pool = _pools[token];
        require(pool.exists, "EquityExchange: token not listed");
        require(msg.value > 0 && equityDesired > 0, "EquityExchange: zero amounts");

        // Calculate the actual equity needed to match the BNB sent (maintain ratio)
        uint256 equityOptimal = (msg.value * pool.equityReserve) / pool.bnbReserve;
        uint256 equityActual = equityOptimal < equityDesired ? equityOptimal : equityDesired;
        require(equityActual > 0, "EquityExchange: zero equity computed");

        // Recalculate BNB needed for equityActual (avoid dust)
        uint256 bnbActual = (equityActual * pool.bnbReserve) / pool.equityReserve;
        require(bnbActual <= msg.value, "EquityExchange: insufficient BNB");

        // Refund excess BNB
        if (msg.value > bnbActual) {
            _sendBnb(msg.sender, msg.value - bnbActual);
        }

        // Pull equity tokens
        IERC20(token).safeTransferFrom(msg.sender, address(this), equityActual);

        // Mint LP shares proportional to contribution
        uint256 newShares = (equityActual * pool.totalLPShares) / pool.equityReserve;
        pool.lpShares[msg.sender] += newShares;
        pool.totalLPShares += newShares;
        pool.equityReserve += equityActual;
        pool.bnbReserve += bnbActual;

        emit LiquidityAdded(token, msg.sender, equityActual, bnbActual, newShares);
    }

    /// @notice Remove liquidity by burning LP shares.
    /// @param token     Listed equity token
    /// @param lpShares_ Number of LP shares to burn
    function removeLiquidity(address token, uint256 lpShares_) external nonReentrant {
        Pool storage pool = _pools[token];
        require(pool.exists, "EquityExchange: token not listed");
        require(lpShares_ > 0 && pool.lpShares[msg.sender] >= lpShares_, "EquityExchange: insufficient LP shares");

        uint256 equityOut = (lpShares_ * pool.equityReserve) / pool.totalLPShares;
        uint256 bnbOut = (lpShares_ * pool.bnbReserve) / pool.totalLPShares;

        pool.lpShares[msg.sender] -= lpShares_;
        pool.totalLPShares -= lpShares_;
        pool.equityReserve -= equityOut;
        pool.bnbReserve -= bnbOut;

        // Return accrued LP fees
        uint256 feesOut = pool.lpBnbFees[msg.sender];
        if (feesOut > 0) {
            pool.lpBnbFees[msg.sender] = 0;
            bnbOut += feesOut;
        }

        // Send equity tokens back — exchange is whitelisted so transfer() is allowed
        IERC20(token).safeTransfer(msg.sender, equityOut);
        _sendBnb(msg.sender, bnbOut);

        emit LiquidityRemoved(token, msg.sender, equityOut, bnbOut - feesOut, lpShares_);
    }

    // -------------------------------------------------------------------------
    // Trading
    // -------------------------------------------------------------------------

    /// @notice Buy equity tokens with BNB (BNB → equity swap).
    /// @param token       Listed equity token to buy
    /// @param minEquityOut Slippage protection — revert if output < this
    function buyTokens(address token, uint256 minEquityOut) external payable nonReentrant {
        Pool storage pool = _pools[token];
        require(pool.exists, "EquityExchange: token not listed");
        require(msg.value > 0, "EquityExchange: zero BNB");

        _advanceWindowOrHalt(token, pool);

        // AMM: x * y = k  →  equityOut = equityReserve * bnbIn / (bnbReserve + bnbIn)
        // No fee on buys (fee is on sells to incentivise holding)
        uint256 equityOut = _getAmountOut(msg.value, pool.bnbReserve, pool.equityReserve);
        require(equityOut >= minEquityOut, "EquityExchange: slippage exceeded");
        require(equityOut < pool.equityReserve, "EquityExchange: insufficient equity liquidity");

        // Update reserves
        uint256 newBnbReserve = pool.bnbReserve + msg.value;
        uint256 newEquityReserve = pool.equityReserve - equityOut;
        pool.bnbReserve = newBnbReserve;
        pool.equityReserve = newEquityReserve;

        // Update hold record for buyer (for fee tier tracking on future sells)
        _recordAcquisition(token, msg.sender, equityOut, block.number);

        // Exchange is a whitelisted address — transfer() from exchange balance is allowed
        IERC20(token).safeTransfer(msg.sender, equityOut);

        emit TokensBought(token, msg.sender, msg.value, equityOut, 0);

        // Post-trade circuit check: if this trade moved price beyond the threshold,
        // halt the next trade. State change persists here (no revert).
        _updateCircuitState(token, pool, newBnbReserve, newEquityReserve);
    }

    /// @notice Sell equity tokens for BNB (equity → BNB swap).
    ///         Caller must have approved this exchange on the equity token.
    /// @param token        Listed equity token to sell
    /// @param equityIn     Amount of equity tokens to sell
    /// @param minBnbOut    Slippage protection
    function sellTokens(address token, uint256 equityIn, uint256 minBnbOut) external nonReentrant {
        Pool storage pool = _pools[token];
        require(pool.exists, "EquityExchange: token not listed");
        require(equityIn > 0, "EquityExchange: zero equity");

        _advanceWindowOrHalt(token, pool);

        // Pull equity tokens from seller into the pool (seller must have approved exchange)
        IERC20(token).safeTransferFrom(msg.sender, address(this), equityIn);

        // AMM output before fee
        uint256 rawBnbOut = _getAmountOut(equityIn, pool.equityReserve, pool.bnbReserve);
        require(rawBnbOut < pool.bnbReserve, "EquityExchange: insufficient BNB liquidity");

        // Determine fee tier based on hold duration
        uint256 feeBps = _getFeeBps(token, msg.sender);
        uint256 fee = (rawBnbOut * feeBps) / FEE_DENOM;
        uint256 bnbOut = rawBnbOut - fee;
        require(bnbOut >= minBnbOut, "EquityExchange: slippage exceeded");

        // Distribute fee: LP_FEE_SHARE_BPS% to LPs, rest to protocol
        uint256 lpFee = (fee * LP_FEE_SHARE_BPS) / FEE_DENOM;
        uint256 protocolFee = fee - lpFee;

        // Update reserves
        uint256 newEquityReserve = pool.equityReserve + equityIn;
        uint256 newBnbReserve = pool.bnbReserve - rawBnbOut;
        pool.equityReserve = newEquityReserve;
        pool.bnbReserve = newBnbReserve + lpFee; // LP fee stays in pool as BNB
        pool.protocolFeesAccrued += protocolFee;

        // Update hold record — reduce seller's tracked balance
        _recordDisposal(token, msg.sender, equityIn);

        _sendBnb(msg.sender, bnbOut);

        emit TokensSold(token, msg.sender, equityIn, bnbOut, fee);

        // Post-trade circuit check: if this trade moved price beyond the threshold,
        // halt the next trade. State change persists here (no revert).
        _updateCircuitState(token, pool, pool.bnbReserve, pool.equityReserve);
    }

    // -------------------------------------------------------------------------
    // Protocol fee withdrawal
    // -------------------------------------------------------------------------

    /// @notice Owner withdraws accumulated protocol fees for a listed token.
    function withdrawProtocolFees(address token) external onlyOwner nonReentrant {
        Pool storage pool = _pools[token];
        require(pool.exists, "EquityExchange: token not listed");
        uint256 amount = pool.protocolFeesAccrued;
        require(amount > 0, "EquityExchange: no fees");
        pool.protocolFeesAccrued = 0;
        _sendBnb(treasury, amount);
        emit ProtocolFeesWithdrawn(token, treasury, amount);
    }

    // -------------------------------------------------------------------------
    // Admin setters
    // -------------------------------------------------------------------------

    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "EquityExchange: zero address");
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    function setListingFee(uint256 newFee) external onlyOwner {
        listingFee = newFee;
        emit ListingFeeUpdated(newFee);
    }

    // -------------------------------------------------------------------------
    // View helpers
    // -------------------------------------------------------------------------

    function getPool(address token)
        external
        view
        returns (
            uint256 equityReserve,
            uint256 bnbReserve,
            uint256 totalLPShares,
            bool circuitBroken,
            uint256 haltedUntilBlock,
            uint256 protocolFeesAccrued
        )
    {
        Pool storage pool = _pools[token];
        return (
            pool.equityReserve,
            pool.bnbReserve,
            pool.totalLPShares,
            pool.circuitBroken,
            pool.haltedUntilBlock,
            pool.protocolFeesAccrued
        );
    }

    function getLPShares(address token, address provider) external view returns (uint256) {
        return _pools[token].lpShares[provider];
    }

    function getHoldRecord(address token, address holder)
        external
        view
        returns (uint256 weightedBlockSum, uint256 totalAmount)
    {
        HoldRecord storage r = _holdRecords[token][holder];
        return (r.weightedBlockSum, r.totalAmount);
    }

    function listedTokenCount() external view returns (uint256) {
        return listedTokens.length;
    }

    // -------------------------------------------------------------------------
    // Internal — AMM math
    // -------------------------------------------------------------------------

    /// @dev Constant-product output: amountOut = reserveOut * amountIn / (reserveIn + amountIn)
    function _getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        internal
        pure
        returns (uint256)
    {
        require(amountIn > 0 && reserveIn > 0 && reserveOut > 0, "EquityExchange: invalid reserves");
        return (amountIn * reserveOut) / (reserveIn + amountIn);
    }

    // -------------------------------------------------------------------------
    // Internal — circuit breaker
    // -------------------------------------------------------------------------

    /// @dev Called at the start of every trade.
    ///
    ///      Models real stock-market circuit breakers:
    ///       • If a halt is still active → revert.
    ///       • If a halt just expired → resume trading with a FRESH reference
    ///         price at the current pool price and restart the 24-hour window.
    ///         This ensures circuit checks are immediately active again at the
    ///         new reference level (not just until the old 24-h window expires).
    ///       • If no halt but the 24-hour window has elapsed → quietly roll over
    ///         the reference price to the current pool price for the next window.
    function _advanceWindowOrHalt(address token, Pool storage pool) internal {
        if (pool.circuitBroken) {
            if (block.number < pool.haltedUntilBlock) {
                revert("EquityExchange: circuit breaker active, trading halted");
            }
            // Halt period has expired: reset reference to current price and
            // restart the window so circuit protection resumes from here.
            _resetWindow(token, pool);
            return;
        }
        // No halt — check if the 24-hour tracking window has rolled over.
        if (block.number >= pool.windowStartBlock + WINDOW_BLOCKS) {
            _resetWindow(token, pool);
        }
    }

    /// @dev Clears the circuit-breaker flag, snapshots the current pool price
    ///      as the new reference, and restarts the 24-hour window.
    function _resetWindow(address token, Pool storage pool) internal {
        pool.circuitBroken = false;
        pool.refPriceNumerator = pool.bnbReserve;
        pool.refPriceDenominator = pool.equityReserve;
        pool.windowStartBlock = block.number;
        emit WindowReset(token, block.number, pool.bnbReserve, pool.equityReserve);
    }

    /// @dev Post-trade circuit check.
    ///      If the completed trade moved price beyond the circuit threshold, set the
    ///      halt state so SUBSEQUENT trades are blocked.
    ///
    ///      Consistent with real stock-market circuit breakers: the triggering trade
    ///      executes, but the market halts afterward.
    ///
    ///      Price cross-multiplication (avoids division):
    ///        price = bnb / equity
    ///        upperBreach: bnb * refDenom * 100 > refNum * equity * (100 + upperPct)
    ///        lowerBreach: bnb * refDenom * 100 < refNum * equity * (100 - lowerPct)
    function _updateCircuitState(
        address token,
        Pool storage pool,
        uint256 currentBnb,
        uint256 currentEquity
    ) internal {
        if (pool.circuitBroken) return; // guard: already halted (e.g. re-entrant path)

        IEquityToken.Config memory cfg = IEquityToken(token).config();
        uint256 refNum = pool.refPriceNumerator;
        uint256 refDenom = pool.refPriceDenominator;

        bool upperBreached = (currentBnb * refDenom * 100) > (refNum * currentEquity * (100 + cfg.upperCircuitPct));
        bool lowerBreached = (currentBnb * refDenom * 100) < (refNum * currentEquity * (100 - cfg.lowerCircuitPct));

        if (upperBreached || lowerBreached) {
            pool.circuitBroken = true;
            pool.haltedUntilBlock = block.number + cfg.circuitHaltBlocks;
            emit CircuitBreaked(token, block.number, pool.haltedUntilBlock, upperBreached);
        }
    }

    // -------------------------------------------------------------------------
    // Internal — hold record tracking
    // -------------------------------------------------------------------------

    function _recordAcquisition(address token, address holder, uint256 amount, uint256 blockNum) internal {
        HoldRecord storage r = _holdRecords[token][holder];
        r.weightedBlockSum += amount * blockNum;
        r.totalAmount += amount;
    }

    function _recordDisposal(address token, address holder, uint256 amount) internal {
        HoldRecord storage r = _holdRecords[token][holder];
        if (r.totalAmount == 0) return;
        // Proportionally reduce the weighted sum
        if (amount >= r.totalAmount) {
            r.weightedBlockSum = 0;
            r.totalAmount = 0;
        } else {
            r.weightedBlockSum = (r.weightedBlockSum * (r.totalAmount - amount)) / r.totalAmount;
            r.totalAmount -= amount;
        }
    }

    function _getFeeBps(address token, address seller) internal view returns (uint256) {
        HoldRecord storage r = _holdRecords[token][seller];
        if (r.totalAmount == 0) return SHORT_TERM_FEE_BPS;
        uint256 avgAcquiredBlock = r.weightedBlockSum / r.totalAmount;
        if (block.number >= avgAcquiredBlock + SHORT_TERM_BLOCKS) {
            return LONG_TERM_FEE_BPS;
        }
        return SHORT_TERM_FEE_BPS;
    }

    // -------------------------------------------------------------------------
    // Internal — BNB transfer helper
    // -------------------------------------------------------------------------

    function _sendBnb(address to, uint256 amount) internal {
        (bool ok,) = payable(to).call{value: amount}("");
        require(ok, "EquityExchange: BNB transfer failed");
    }

    receive() external payable {}
}
