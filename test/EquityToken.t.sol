// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {EquityToken} from "../src/EquityToken.sol";
import {KYCRegistry} from "../src/KYCRegistry.sol";
import {IEquityToken} from "../src/interfaces/IEquityToken.sol";

contract EquityTokenTest is Test {
    EquityToken internal token;
    KYCRegistry internal kyc;

    address internal owner = makeAddr("owner");
    address internal exchange = makeAddr("exchange");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    uint256 internal constant MAX_SUPPLY = 1_000_000e18;

    IEquityToken.Config internal defaultCfg = IEquityToken.Config({
        upperCircuitPct: 10,
        lowerCircuitPct: 10,
        circuitHaltBlocks: 100,
        limitOwnership: false,
        maxOwnershipPct: 0,
        kycRequired: false,
        kycProvider: address(0)
    });

    function setUp() public {
        vm.prank(owner);
        token = new EquityToken("Acme Corp", "ACME", MAX_SUPPLY, owner, defaultCfg);

        kyc = new KYCRegistry(owner);
    }

    // -------------------------------------------------------------------------
    // Deployment
    // -------------------------------------------------------------------------

    function test_deployment_setsMetadata() public view {
        assertEq(token.name(), "Acme Corp");
        assertEq(token.symbol(), "ACME");
        assertEq(token.maxSupply(), MAX_SUPPLY);
        assertEq(token.totalSupply(), 0);
        assertEq(token.owner(), owner);
    }

    function test_deployment_setsConfig() public view {
        IEquityToken.Config memory cfg = token.config();
        assertEq(cfg.upperCircuitPct, 10);
        assertEq(cfg.lowerCircuitPct, 10);
        assertEq(cfg.circuitHaltBlocks, 100);
        assertFalse(cfg.kycRequired);
        assertFalse(cfg.limitOwnership);
    }

    function test_deployment_revertsOnZeroMaxSupply() public {
        vm.expectRevert("EquityToken: maxSupply must be > 0");
        new EquityToken("X", "X", 0, owner, defaultCfg);
    }

    function test_deployment_revertsOnInvalidCircuitPct() public {
        IEquityToken.Config memory bad = defaultCfg;
        bad.upperCircuitPct = 0;
        vm.expectRevert("EquityToken: invalid upperCircuitPct");
        new EquityToken("X", "X", MAX_SUPPLY, owner, bad);
    }

    function test_deployment_revertsOnZeroHaltBlocks() public {
        IEquityToken.Config memory bad = defaultCfg;
        bad.circuitHaltBlocks = 0;
        vm.expectRevert("EquityToken: circuitHaltBlocks must be > 0");
        new EquityToken("X", "X", MAX_SUPPLY, owner, bad);
    }

    function test_deployment_revertsOnKYCWithoutProvider() public {
        IEquityToken.Config memory bad = defaultCfg;
        bad.kycRequired = true;
        bad.kycProvider = address(0);
        vm.expectRevert("EquityToken: KYC provider required");
        new EquityToken("X", "X", MAX_SUPPLY, owner, bad);
    }

    function test_deployment_revertsOnOwnershipWithoutPct() public {
        IEquityToken.Config memory bad = defaultCfg;
        bad.limitOwnership = true;
        bad.maxOwnershipPct = 0;
        vm.expectRevert("EquityToken: invalid maxOwnershipPct");
        new EquityToken("X", "X", MAX_SUPPLY, owner, bad);
    }

    // -------------------------------------------------------------------------
    // Minting
    // -------------------------------------------------------------------------

    function test_mint_ownerCanMint() public {
        vm.prank(owner);
        token.mint(alice, 100e18);
        assertEq(token.balanceOf(alice), 100e18);
        assertEq(token.totalSupply(), 100e18);
    }

    function test_mint_revertsIfNotOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        token.mint(alice, 100e18);
    }

    function test_mint_revertsIfExceedsMaxSupply() public {
        vm.prank(owner);
        vm.expectRevert("EquityToken: exceeds max supply");
        token.mint(alice, MAX_SUPPLY + 1);
    }

    function test_mint_respectsMaxSupplyCap() public {
        vm.prank(owner);
        token.mint(alice, MAX_SUPPLY);
        assertEq(token.totalSupply(), MAX_SUPPLY);

        vm.prank(owner);
        vm.expectRevert("EquityToken: exceeds max supply");
        token.mint(alice, 1);
    }

    // -------------------------------------------------------------------------
    // Non-transferability
    // -------------------------------------------------------------------------

    function test_transfer_revertsForNonExchange() public {
        vm.prank(owner);
        token.mint(alice, 100e18);

        vm.prank(alice);
        vm.expectRevert("EquityToken: direct transfers disabled, use the exchange");
        token.transfer(bob, 50e18);
    }

    function test_transfer_allowsWhitelistedExchange() public {
        vm.prank(owner);
        token.mint(exchange, 100e18);

        vm.prank(owner);
        token.whitelistExchange(exchange);

        vm.prank(exchange);
        token.transfer(alice, 50e18);
        assertEq(token.balanceOf(alice), 50e18);
    }

    function test_transferFrom_revertsForNonExchange() public {
        vm.prank(owner);
        token.mint(alice, 100e18);

        vm.prank(alice);
        token.approve(bob, 50e18);

        vm.prank(bob);
        vm.expectRevert("EquityToken: caller is not a whitelisted exchange");
        token.transferFrom(alice, bob, 50e18);
    }

    function test_transferFrom_allowsWhitelistedExchange() public {
        vm.prank(owner);
        token.mint(alice, 100e18);

        vm.prank(owner);
        token.whitelistExchange(exchange);

        vm.prank(alice);
        token.approve(exchange, 50e18);

        vm.prank(exchange);
        token.transferFrom(alice, bob, 50e18);
        assertEq(token.balanceOf(bob), 50e18);
        assertEq(token.balanceOf(alice), 50e18);
    }

    // -------------------------------------------------------------------------
    // Burning disabled
    // -------------------------------------------------------------------------

    function test_burn_alwaysReverts() public {
        vm.prank(owner);
        token.mint(alice, 100e18);

        vm.prank(alice);
        vm.expectRevert("EquityToken: burning disabled");
        token.burn(50e18);
    }

    function test_burnFrom_alwaysReverts() public {
        vm.prank(owner);
        token.mint(alice, 100e18);

        vm.prank(alice);
        token.approve(bob, 50e18);

        vm.prank(bob);
        vm.expectRevert("EquityToken: burning disabled");
        token.burnFrom(alice, 50e18);
    }

    // -------------------------------------------------------------------------
    // Exchange whitelist
    // -------------------------------------------------------------------------

    function test_whitelistExchange_setsByOwner() public {
        assertFalse(token.isWhitelistedExchange(exchange));

        vm.prank(owner);
        token.whitelistExchange(exchange);

        assertTrue(token.isWhitelistedExchange(exchange));
    }

    function test_whitelistExchange_revertsForNonOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        token.whitelistExchange(exchange);
    }

    function test_removeExchange_removesFromWhitelist() public {
        vm.startPrank(owner);
        token.whitelistExchange(exchange);
        token.removeExchange(exchange);
        vm.stopPrank();

        assertFalse(token.isWhitelistedExchange(exchange));
    }

    function test_removedExchange_cannotTransfer() public {
        vm.startPrank(owner);
        token.mint(exchange, 100e18);
        token.whitelistExchange(exchange);
        token.removeExchange(exchange);
        vm.stopPrank();

        vm.prank(exchange);
        vm.expectRevert("EquityToken: direct transfers disabled, use the exchange");
        token.transfer(alice, 50e18);
    }

    // -------------------------------------------------------------------------
    // KYC enforcement
    // -------------------------------------------------------------------------

    function test_kyc_blocksUnverifiedRecipient() public {
        IEquityToken.Config memory kycCfg = defaultCfg;
        kycCfg.kycRequired = true;
        kycCfg.kycProvider = address(kyc);

        vm.prank(owner);
        EquityToken kycToken = new EquityToken("KYC Token", "KT", MAX_SUPPLY, owner, kycCfg);

        vm.prank(owner);
        kycToken.whitelistExchange(exchange);

        vm.prank(owner);
        kycToken.mint(exchange, 1000e18);

        // alice is NOT KYC verified
        vm.prank(exchange);
        vm.expectRevert("EquityToken: recipient not KYC verified");
        kycToken.transfer(alice, 100e18);
    }

    function test_kyc_allowsVerifiedRecipient() public {
        IEquityToken.Config memory kycCfg = defaultCfg;
        kycCfg.kycRequired = true;
        kycCfg.kycProvider = address(kyc);

        vm.prank(owner);
        EquityToken kycToken = new EquityToken("KYC Token", "KT", MAX_SUPPLY, owner, kycCfg);

        vm.prank(owner);
        kycToken.whitelistExchange(exchange);

        vm.prank(owner);
        kycToken.mint(exchange, 1000e18);

        // Verify alice
        vm.prank(owner);
        kyc.verify(alice);

        vm.prank(exchange);
        kycToken.transfer(alice, 100e18);
        assertEq(kycToken.balanceOf(alice), 100e18);
    }

    function test_kyc_exemptForExchangeReceiving() public {
        // Exchange address itself should not require KYC when receiving tokens
        IEquityToken.Config memory kycCfg = defaultCfg;
        kycCfg.kycRequired = true;
        kycCfg.kycProvider = address(kyc);

        vm.prank(owner);
        EquityToken kycToken = new EquityToken("KYC Token", "KT", MAX_SUPPLY, owner, kycCfg);

        vm.prank(owner);
        kycToken.whitelistExchange(exchange);

        // Mint to exchange — exchange is exempt from KYC check as recipient
        vm.prank(owner);
        kycToken.mint(exchange, 1000e18);
        assertEq(kycToken.balanceOf(exchange), 1000e18);
    }

    // -------------------------------------------------------------------------
    // Max ownership enforcement
    // -------------------------------------------------------------------------

    function test_ownershipLimit_blocksOverLimit() public {
        IEquityToken.Config memory ownCfg = defaultCfg;
        ownCfg.limitOwnership = true;
        ownCfg.maxOwnershipPct = 10; // max 10% per wallet

        vm.prank(owner);
        EquityToken ownToken = new EquityToken("Owned", "OWN", 1000e18, owner, ownCfg);

        vm.prank(owner);
        ownToken.whitelistExchange(exchange);

        // Mint 1000 tokens total
        vm.prank(owner);
        ownToken.mint(exchange, 1000e18);

        // Try to transfer 200 (20%) to alice → should fail
        vm.prank(exchange);
        vm.expectRevert("EquityToken: exceeds max ownership limit");
        ownToken.transfer(alice, 200e18);
    }

    function test_ownershipLimit_allowsWithinLimit() public {
        IEquityToken.Config memory ownCfg = defaultCfg;
        ownCfg.limitOwnership = true;
        ownCfg.maxOwnershipPct = 10;

        vm.prank(owner);
        EquityToken ownToken = new EquityToken("Owned", "OWN", 1000e18, owner, ownCfg);

        vm.prank(owner);
        ownToken.whitelistExchange(exchange);

        vm.prank(owner);
        ownToken.mint(exchange, 1000e18);

        // Transfer exactly 10% (100 tokens) — should succeed
        vm.prank(exchange);
        ownToken.transfer(alice, 100e18);
        assertEq(ownToken.balanceOf(alice), 100e18);
    }

    // -------------------------------------------------------------------------
    // Config update
    // -------------------------------------------------------------------------

    function test_updateConfig_byOwner() public {
        IEquityToken.Config memory newCfg = defaultCfg;
        newCfg.upperCircuitPct = 20;
        newCfg.lowerCircuitPct = 5;

        vm.prank(owner);
        token.updateConfig(newCfg);

        IEquityToken.Config memory stored = token.config();
        assertEq(stored.upperCircuitPct, 20);
        assertEq(stored.lowerCircuitPct, 5);
    }

    function test_updateConfig_revertsForNonOwner() public {
        IEquityToken.Config memory newCfg = defaultCfg;
        vm.prank(alice);
        vm.expectRevert();
        token.updateConfig(newCfg);
    }
}
