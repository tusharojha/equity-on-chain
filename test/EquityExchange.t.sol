// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {EquityExchange} from "../src/EquityExchange.sol";
import {EquityToken} from "../src/EquityToken.sol";
import {IEquityToken} from "../src/interfaces/IEquityToken.sol";

contract EquityExchangeTest is Test {
    EquityExchange internal exchange;
    EquityToken internal token;

    address internal owner = makeAddr("owner");
    address internal treasury = makeAddr("treasury");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal lp = makeAddr("lp");

    uint256 internal constant MAX_SUPPLY = 1_000_000e18;
    uint256 internal constant LISTING_FEE = 0.1 ether;

    // Larger pool for general tests: 100,000 tokens / 10 BNB
    // This allows trades up to ~0.49 BNB before hitting 10% circuit.
    // We use 50% circuit for general behaviour tests to be explicit.
    uint256 internal constant INIT_EQUITY = 100_000e18;
    uint256 internal constant INIT_BNB = 10 ether;

    // Wide circuit (50%) for general tests — we test the breaker separately
    IEquityToken.Config internal defaultCfg = IEquityToken.Config({
        upperCircuitPct: 50,
        lowerCircuitPct: 50,
        circuitHaltBlocks: 100,
        limitOwnership: false,
        maxOwnershipPct: 0,
        kycRequired: false,
        kycProvider: address(0)
    });

    // Tight circuit (10%) for circuit-breaker-specific tests
    IEquityToken.Config internal tightCfg = IEquityToken.Config({
        upperCircuitPct: 10,
        lowerCircuitPct: 10,
        circuitHaltBlocks: 100,
        limitOwnership: false,
        maxOwnershipPct: 0,
        kycRequired: false,
        kycProvider: address(0)
    });

    function setUp() public {
        // Deploy exchange
        exchange = new EquityExchange(owner, treasury, LISTING_FEE);

        // Deploy token with owner as issuer (50% circuit for general tests)
        vm.prank(owner);
        token = new EquityToken("Acme Corp", "ACME", MAX_SUPPLY, owner, defaultCfg);

        // Whitelist exchange on token
        vm.prank(owner);
        token.whitelistExchange(address(exchange));

        // Mint initial tokens + extra for tests
        vm.prank(owner);
        token.mint(owner, INIT_EQUITY + 200_000e18);

        // Approve exchange to pull initial equity
        vm.prank(owner);
        token.approve(address(exchange), INIT_EQUITY);

        // List the token
        vm.deal(owner, 100 ether);
        vm.prank(owner);
        exchange.listToken{value: LISTING_FEE + INIT_BNB}(address(token), INIT_EQUITY);
    }

    // -------------------------------------------------------------------------
    // Listing
    // -------------------------------------------------------------------------

    function test_listToken_createsPool() public view {
        (uint256 er, uint256 br, uint256 lps,,,) = exchange.getPool(address(token));
        assertEq(er, INIT_EQUITY);
        assertEq(br, INIT_BNB);
        assertEq(lps, INIT_EQUITY); // bootstrap: LP shares == initial equity
    }

    function test_listToken_sendsFeeToTreasury() public view {
        assertEq(treasury.balance, LISTING_FEE);
    }

    function test_listToken_revertsIfAlreadyListed() public {
        vm.prank(owner);
        token.approve(address(exchange), INIT_EQUITY);

        vm.prank(owner);
        vm.expectRevert("EquityExchange: already listed");
        exchange.listToken{value: LISTING_FEE + INIT_BNB}(address(token), INIT_EQUITY);
    }

    function test_listToken_revertsWithInsufficientBNB() public {
        EquityToken token2 = _deployFreshToken(defaultCfg);

        vm.prank(owner);
        token2.approve(address(exchange), INIT_EQUITY);

        vm.prank(owner);
        vm.expectRevert("EquityExchange: insufficient BNB (listing fee + initial liquidity)");
        exchange.listToken{value: LISTING_FEE}(address(token2), INIT_EQUITY);
    }

    // -------------------------------------------------------------------------
    // Liquidity
    // -------------------------------------------------------------------------

    function test_addLiquidity_issuesLPShares() public {
        // lp provides 1 BNB + proportional equity (ratio: 100k eq / 10 BNB → 10k eq for 1 BNB)
        uint256 bnbIn = 1 ether;
        uint256 equityNeeded = 10_000e18;

        vm.prank(owner);
        token.mint(lp, equityNeeded);

        vm.prank(lp);
        token.approve(address(exchange), equityNeeded);

        vm.deal(lp, 2 ether);
        vm.prank(lp);
        exchange.addLiquidity{value: bnbIn}(address(token), equityNeeded);

        uint256 lpShares = exchange.getLPShares(address(token), lp);
        assertGt(lpShares, 0);

        (uint256 er, uint256 br,,,, ) = exchange.getPool(address(token));
        assertEq(er, INIT_EQUITY + equityNeeded);
        assertEq(br, INIT_BNB + bnbIn);
    }

    function test_removeLiquidity_returnsProportionalAmounts() public {
        uint256 lpSharesBefore = exchange.getLPShares(address(token), owner);
        assertGt(lpSharesBefore, 0);

        uint256 ownerEquityBefore = token.balanceOf(owner);
        uint256 ownerBnbBefore = owner.balance;

        vm.prank(owner);
        exchange.removeLiquidity(address(token), lpSharesBefore);

        assertEq(token.balanceOf(owner), ownerEquityBefore + INIT_EQUITY);
        assertGt(owner.balance, ownerBnbBefore);
        assertEq(exchange.getLPShares(address(token), owner), 0);
    }

    function test_removeLiquidity_revertsWithInsufficientShares() public {
        vm.prank(alice);
        vm.expectRevert("EquityExchange: insufficient LP shares");
        exchange.removeLiquidity(address(token), 1);
    }

    // -------------------------------------------------------------------------
    // Buying tokens
    // -------------------------------------------------------------------------

    function test_buyTokens_swapsCorrectly() public {
        uint256 bnbIn = 0.1 ether; // << well within 50% circuit
        uint256 expectedOut = (INIT_EQUITY * bnbIn) / (INIT_BNB + bnbIn);

        vm.deal(alice, 1 ether);
        vm.prank(alice);
        exchange.buyTokens{value: bnbIn}(address(token), 0);

        assertEq(token.balanceOf(alice), expectedOut);
    }

    function test_buyTokens_updatesPool() public {
        uint256 bnbIn = 0.1 ether;

        vm.deal(alice, 1 ether);
        vm.prank(alice);
        exchange.buyTokens{value: bnbIn}(address(token), 0);

        (uint256 er, uint256 br,,,, ) = exchange.getPool(address(token));
        assertEq(br, INIT_BNB + bnbIn);
        assertLt(er, INIT_EQUITY);
    }

    function test_buyTokens_revertsOnSlippage() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert("EquityExchange: slippage exceeded");
        exchange.buyTokens{value: 0.1 ether}(address(token), INIT_EQUITY);
    }

    function test_buyTokens_revertsWithZeroBNB() public {
        vm.prank(alice);
        vm.expectRevert("EquityExchange: zero BNB");
        exchange.buyTokens{value: 0}(address(token), 0);
    }

    function test_buyTokens_tracksHoldRecord() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        exchange.buyTokens{value: 0.1 ether}(address(token), 0);

        (uint256 weightedSum, uint256 total) = exchange.getHoldRecord(address(token), alice);
        assertGt(total, 0);
        assertGt(weightedSum, 0);
    }

    // -------------------------------------------------------------------------
    // Selling tokens
    // -------------------------------------------------------------------------

    function test_sellTokens_swapsCorrectly() public {
        // Buy some tokens for alice
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        exchange.buyTokens{value: 0.1 ether}(address(token), 0);

        uint256 aliceEquity = token.balanceOf(alice);
        uint256 aliceBnbBefore = alice.balance;

        vm.prank(alice);
        token.approve(address(exchange), aliceEquity);

        vm.prank(alice);
        exchange.sellTokens(address(token), aliceEquity, 0);

        assertEq(token.balanceOf(alice), 0);
        assertGt(alice.balance, aliceBnbBefore);
    }

    function test_sellTokens_chargesShortTermFee() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        exchange.buyTokens{value: 0.1 ether}(address(token), 0);

        uint256 aliceEquity = token.balanceOf(alice);

        (uint256 er, uint256 br,,,, ) = exchange.getPool(address(token));
        uint256 rawBnbOut = (aliceEquity * br) / (er + aliceEquity);
        uint256 expectedFee = (rawBnbOut * exchange.SHORT_TERM_FEE_BPS()) / exchange.FEE_DENOM();
        uint256 expectedOut = rawBnbOut - expectedFee;

        vm.prank(alice);
        token.approve(address(exchange), aliceEquity);

        uint256 balBefore = alice.balance;
        vm.prank(alice);
        exchange.sellTokens(address(token), aliceEquity, 0);

        assertApproxEqRel(alice.balance - balBefore, expectedOut, 0.001e18);
    }

    function test_sellTokens_chargesLongTermFee() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        exchange.buyTokens{value: 0.1 ether}(address(token), 0);

        uint256 aliceEquity = token.balanceOf(alice);

        // Fast-forward past long-term threshold
        vm.roll(block.number + exchange.SHORT_TERM_BLOCKS() + 1);

        // Window will reset on next trade — use a fresh pool state
        (uint256 er, uint256 br,,,, ) = exchange.getPool(address(token));
        uint256 rawBnbOut = (aliceEquity * br) / (er + aliceEquity);
        uint256 expectedFee = (rawBnbOut * exchange.LONG_TERM_FEE_BPS()) / exchange.FEE_DENOM();
        uint256 expectedOut = rawBnbOut - expectedFee;

        vm.prank(alice);
        token.approve(address(exchange), aliceEquity);

        uint256 balBefore = alice.balance;
        vm.prank(alice);
        exchange.sellTokens(address(token), aliceEquity, 0);

        assertApproxEqRel(alice.balance - balBefore, expectedOut, 0.001e18);
    }

    function test_sellTokens_revertsOnSlippage() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        exchange.buyTokens{value: 0.1 ether}(address(token), 0);

        uint256 equity = token.balanceOf(alice);
        vm.prank(alice);
        token.approve(address(exchange), equity);

        vm.prank(alice);
        vm.expectRevert("EquityExchange: slippage exceeded");
        exchange.sellTokens(address(token), equity, 100 ether);
    }

    // -------------------------------------------------------------------------
    // Circuit Breaker — uses a tight pool (1 BNB / 10k tokens, 10% circuit)
    // -------------------------------------------------------------------------

    function _setupTightCircuitPool() internal returns (EquityToken tToken) {
        tToken = _deployFreshToken(tightCfg);

        vm.prank(owner);
        tToken.mint(owner, 10_000e18);
        vm.prank(owner);
        tToken.approve(address(exchange), 10_000e18);

        // List with 1 BNB initial (small pool → easy to breach 10%)
        vm.prank(owner);
        exchange.listToken{value: LISTING_FEE + 1 ether}(address(tToken), 10_000e18);
    }

    function test_circuitBreaker_upperBreachSetsHaltAfterTrade() public {
        EquityToken tToken = _setupTightCircuitPool();

        // Large buy (5 BNB into 1 BNB pool) → price moons past 10% upper circuit
        // The triggering trade executes (like real markets); subsequent trades are halted.
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        exchange.buyTokens{value: 5 ether}(address(tToken), 0); // goes through!

        // Circuit should now be set
        (,,, bool broken,,) = exchange.getPool(address(tToken));
        assertTrue(broken, "circuit should be broken after large buy");
    }

    function test_circuitBreaker_lowerBreachSetsHaltAfterTrade() public {
        EquityToken tToken = _setupTightCircuitPool();

        // Large dump sets the lower circuit
        uint256 whaleAmount = 3_000e18; // 30% of pool reserves
        vm.prank(owner);
        tToken.mint(alice, whaleAmount);

        vm.prank(alice);
        tToken.approve(address(exchange), whaleAmount);

        vm.prank(alice);
        exchange.sellTokens(address(tToken), whaleAmount, 0); // goes through!

        (,,, bool broken,,) = exchange.getPool(address(tToken));
        assertTrue(broken, "circuit should be broken after large sell");
    }

    function test_circuitBreaker_haltsDuringHaltBlocks() public {
        EquityToken tToken = _setupTightCircuitPool();

        // Execute breaching trade → triggers circuit
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        exchange.buyTokens{value: 5 ether}(address(tToken), 0);

        // Pool should now be halted
        (,,, bool broken, uint256 haltedUntil, ) = exchange.getPool(address(tToken));
        assertTrue(broken, "circuit should be broken");
        assertGt(haltedUntil, block.number);

        // Any trade during halt period should be rejected
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        vm.expectRevert("EquityExchange: circuit breaker active, trading halted");
        exchange.buyTokens{value: 0.001 ether}(address(tToken), 0);
    }

    function test_circuitBreaker_resumesAfterWindowReset() public {
        EquityToken tToken = _setupTightCircuitPool();

        // Trigger the circuit
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        exchange.buyTokens{value: 5 ether}(address(tToken), 0);

        (,,, bool broken, uint256 haltedUntil, ) = exchange.getPool(address(tToken));
        assertTrue(broken);

        // Roll past halt period + full window (window reset clears the circuit state)
        vm.roll(haltedUntil + exchange.WINDOW_BLOCKS());

        // Small trade should now succeed
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        exchange.buyTokens{value: 0.001 ether}(address(tToken), 0);
        assertGt(tToken.balanceOf(bob), 0);
    }

    // -------------------------------------------------------------------------
    // 24-hour window reset
    // -------------------------------------------------------------------------

    function test_windowReset_updatesRefPrice() public {
        // Small buy to shift the price slightly
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        exchange.buyTokens{value: 0.05 ether}(address(token), 0);

        // Advance past WINDOW_BLOCKS
        vm.roll(block.number + exchange.WINDOW_BLOCKS() + 1);

        // Next trade resets window — should succeed without circuit break
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        exchange.buyTokens{value: 0.001 ether}(address(token), 0);
        assertGt(token.balanceOf(bob), 0);
    }

    // -------------------------------------------------------------------------
    // Admin
    // -------------------------------------------------------------------------

    function test_setTreasury_updatedByOwner() public {
        address newTreasury = makeAddr("newTreasury");
        vm.prank(owner);
        exchange.setTreasury(newTreasury);
        assertEq(exchange.treasury(), newTreasury);
    }

    function test_setTreasury_revertsForNonOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        exchange.setTreasury(alice);
    }

    function test_setListingFee_updatedByOwner() public {
        vm.prank(owner);
        exchange.setListingFee(0.5 ether);
        assertEq(exchange.listingFee(), 0.5 ether);
    }

    function test_withdrawProtocolFees_sendsToTreasury() public {
        // Generate sell fees
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        exchange.buyTokens{value: 0.1 ether}(address(token), 0);

        uint256 aliceEquity = token.balanceOf(alice);
        vm.prank(alice);
        token.approve(address(exchange), aliceEquity);
        vm.prank(alice);
        exchange.sellTokens(address(token), aliceEquity, 0);

        (, , , , , uint256 protocolFees) = exchange.getPool(address(token));
        assertGt(protocolFees, 0);

        uint256 treasuryBefore = treasury.balance;
        vm.prank(owner);
        exchange.withdrawProtocolFees(address(token));
        assertGt(treasury.balance, treasuryBefore);

        (, , , , , uint256 feesAfter) = exchange.getPool(address(token));
        assertEq(feesAfter, 0);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    function _deployFreshToken(IEquityToken.Config memory cfg) internal returns (EquityToken) {
        vm.prank(owner);
        EquityToken t = new EquityToken("Fresh", "FRSH", MAX_SUPPLY, owner, cfg);
        vm.prank(owner);
        t.whitelistExchange(address(exchange));
        return t;
    }
}
