// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {EquityFactory} from "../src/EquityFactory.sol";
import {EquityExchange} from "../src/EquityExchange.sol";
import {EquityToken} from "../src/EquityToken.sol";
import {IEquityToken} from "../src/interfaces/IEquityToken.sol";

contract EquityFactoryTest is Test {
    EquityExchange internal exchange;
    EquityFactory internal factory;

    address internal owner = makeAddr("owner");
    address internal treasury = makeAddr("treasury");
    address internal founder = makeAddr("founder");

    uint256 internal constant LISTING_FEE = 0.1 ether;
    uint256 internal constant INIT_BNB = 0.5 ether;

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
        exchange = new EquityExchange(owner, treasury, LISTING_FEE);
        factory = new EquityFactory(owner, payable(address(exchange)));

        vm.deal(founder, 10 ether);
    }

    // -------------------------------------------------------------------------
    // Deployment
    // -------------------------------------------------------------------------

    function test_constructor_setsExchange() public view {
        assertEq(address(factory.exchange()), address(exchange));
    }

    function test_constructor_revertsOnZeroExchange() public {
        vm.expectRevert("EquityFactory: zero exchange");
        new EquityFactory(owner, payable(address(0)));
    }

    // -------------------------------------------------------------------------
    // create() — full atomic flow
    // -------------------------------------------------------------------------

    function test_create_deploysToken() public {
        vm.prank(founder);
        address tokenAddr = factory.create{value: LISTING_FEE + INIT_BNB}(
            "Acme Corp", "ACME", 1_000_000e18, 10_000e18, 50_000e18, defaultCfg
        );
        assertTrue(tokenAddr != address(0));
    }

    function test_create_transfersOwnershipToFounder() public {
        vm.prank(founder);
        address tokenAddr = factory.create{value: LISTING_FEE + INIT_BNB}(
            "Acme Corp", "ACME", 1_000_000e18, 10_000e18, 50_000e18, defaultCfg
        );
        EquityToken token = EquityToken(tokenAddr);
        assertEq(token.owner(), founder);
    }

    function test_create_whitelistsExchangeOnToken() public {
        vm.prank(founder);
        address tokenAddr = factory.create{value: LISTING_FEE + INIT_BNB}(
            "Acme Corp", "ACME", 1_000_000e18, 10_000e18, 50_000e18, defaultCfg
        );
        EquityToken token = EquityToken(tokenAddr);
        assertTrue(token.isWhitelistedExchange(address(exchange)));
    }

    function test_create_mintsFounderAllocation() public {
        uint256 founderTokens = 50_000e18;
        vm.prank(founder);
        address tokenAddr = factory.create{value: LISTING_FEE + INIT_BNB}(
            "Acme Corp", "ACME", 1_000_000e18, 10_000e18, founderTokens, defaultCfg
        );
        EquityToken token = EquityToken(tokenAddr);
        assertEq(token.balanceOf(founder), founderTokens);
    }

    function test_create_seedsPoolWithCorrectAmounts() public {
        uint256 poolTokens = 10_000e18;
        vm.prank(founder);
        address tokenAddr = factory.create{value: LISTING_FEE + INIT_BNB}(
            "Acme Corp", "ACME", 1_000_000e18, poolTokens, 0, defaultCfg
        );

        (uint256 er, uint256 br,,,, ) = exchange.getPool(tokenAddr);
        assertEq(er, poolTokens);
        assertEq(br, INIT_BNB);
    }

    function test_create_recordsDeployment() public {
        vm.prank(founder);
        address tokenAddr = factory.create{value: LISTING_FEE + INIT_BNB}(
            "Acme Corp", "ACME", 1_000_000e18, 10_000e18, 0, defaultCfg
        );

        assertEq(factory.deployedTokenCount(), 1);
        assertEq(factory.deployedTokens(0), tokenAddr);

        address[] memory founderTokens = factory.getTokensByFounder(founder);
        assertEq(founderTokens.length, 1);
        assertEq(founderTokens[0], tokenAddr);
    }

    function test_create_revertsWithInsufficientBNB() public {
        vm.prank(founder);
        vm.expectRevert("EquityFactory: need listingFee + initial BNB");
        factory.create{value: LISTING_FEE}(
            "Acme Corp", "ACME", 1_000_000e18, 10_000e18, 0, defaultCfg
        );
    }

    function test_create_revertsWhenPoolTokensExceedMaxSupply() public {
        vm.prank(founder);
        vm.expectRevert("EquityFactory: mint exceeds maxSupply");
        factory.create{value: LISTING_FEE + INIT_BNB}(
            "Acme Corp", "ACME", 100e18, 10_000e18, 50_000e18, defaultCfg
        );
    }

    function test_create_revertsWithZeroPoolTokens() public {
        vm.prank(founder);
        vm.expectRevert("EquityFactory: poolTokens must be > 0");
        factory.create{value: LISTING_FEE + INIT_BNB}(
            "Acme Corp", "ACME", 1_000_000e18, 0, 50_000e18, defaultCfg
        );
    }

    function test_create_multipleTokensBySameFounder() public {
        vm.prank(founder);
        factory.create{value: LISTING_FEE + INIT_BNB}(
            "Token A", "TA", 1_000_000e18, 10_000e18, 0, defaultCfg
        );

        vm.prank(founder);
        factory.create{value: LISTING_FEE + INIT_BNB}(
            "Token B", "TB", 500_000e18, 5_000e18, 0, defaultCfg
        );

        assertEq(factory.deployedTokenCount(), 2);
        assertEq(factory.getTokensByFounder(founder).length, 2);
    }

    // -------------------------------------------------------------------------
    // Integration: created token can be traded
    // -------------------------------------------------------------------------

    function test_createdToken_canBeBought() public {
        vm.prank(founder);
        address tokenAddr = factory.create{value: LISTING_FEE + INIT_BNB}(
            "Acme Corp", "ACME", 1_000_000e18, 10_000e18, 0, defaultCfg
        );

        address buyer = makeAddr("buyer");
        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        exchange.buyTokens{value: 0.01 ether}(tokenAddr, 0);

        EquityToken token = EquityToken(tokenAddr);
        assertGt(token.balanceOf(buyer), 0);
    }

    function test_createdToken_founderCanSell() public {
        uint256 founderTokens = 50_000e18;
        vm.prank(founder);
        address tokenAddr = factory.create{value: LISTING_FEE + INIT_BNB}(
            "Acme Corp", "ACME", 1_000_000e18, 10_000e18, founderTokens, defaultCfg
        );

        EquityToken token = EquityToken(tokenAddr);
        uint256 sellAmount = 100e18;

        vm.prank(founder);
        token.approve(address(exchange), sellAmount);

        uint256 bnbBefore = founder.balance;
        vm.prank(founder);
        exchange.sellTokens(tokenAddr, sellAmount, 0);
        assertGt(founder.balance, bnbBefore);
    }
}
