// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {KYCRegistry} from "../src/KYCRegistry.sol";
import {EquityExchange} from "../src/EquityExchange.sol";
import {EquityFactory} from "../src/EquityFactory.sol";
import {EquityToken} from "../src/EquityToken.sol";
import {IEquityToken} from "../src/interfaces/IEquityToken.sol";

/// @title Deploy
/// @notice Deploys the full EquityOnChain protocol stack to BSC Testnet.
///
/// Required environment variables:
///   DEPLOYER_PRIVATE_KEY  — private key of the deploying wallet
///   TREASURY_ADDRESS      — address that receives listing fees & protocol fees
///
/// Optional (for demo listing):
///   DEPLOY_DEMO_TOKEN     — set to "true" to also create a demo equity token
///
/// Usage (BSC testnet, chain ID 97):
///   forge script script/Deploy.s.sol \
///     --rpc-url https://bsc-testnet-rpc.publicnode.com \
///     --chain-id 97 \
///     --broadcast \
///     --verify \
///     --verifier-url https://api-testnet.bscscan.com/api \
///     --etherscan-api-key $BSCSCAN_API_KEY \
///     -vvvv
///
/// Usage (BSC mainnet — double-check everything first, chain ID 56):
///   forge script script/Deploy.s.sol \
///     --rpc-url https://bsc-rpc.publicnode.com \
///     --chain-id 56 \
///     --broadcast \
///     -vvvv
contract Deploy is Script {
    // -------------------------------------------------------------------------
    // Protocol parameters — adjust before deploying
    // -------------------------------------------------------------------------

    /// @dev Listing fee: 0.05 BNB (~$30 at $600/BNB)
    uint256 public constant LISTING_FEE = 0.05 ether;

    // -------------------------------------------------------------------------
    // Demo token parameters (only used when DEPLOY_DEMO_TOKEN=true)
    // -------------------------------------------------------------------------

    string  internal constant DEMO_NAME    = "Demo Corp";
    string  internal constant DEMO_SYMBOL  = "DEMO";
    uint256 internal constant DEMO_MAX_SUPPLY   = 10_000_000e18; // 10M tokens
    uint256 internal constant DEMO_POOL_TOKENS  = 500_000e18;    // 500k to pool
    uint256 internal constant DEMO_FOUNDER_TOKENS = 1_000_000e18; // 1M to founder

    // Demo token regulatory config
    IEquityToken.Config internal demoConfig = IEquityToken.Config({
        upperCircuitPct:    10,    // halt if price rises >10% in 24h
        lowerCircuitPct:    10,    // halt if price falls >10% in 24h
        circuitHaltBlocks:  100,   // halt ~300 s on BSC Testnet (3 s/block × 100 blocks)
        limitOwnership:     true,
        maxOwnershipPct:    5,     // no single wallet can hold >5%
        kycRequired:        false, // open trading for demo
        kycProvider:        address(0)
    });

    // -------------------------------------------------------------------------
    // run()
    // -------------------------------------------------------------------------

    function run() external {
        // Read environment
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer    = vm.addr(deployerKey);
        address treasury    = vm.envAddress("TREASURY_ADDRESS");
        bool    deployDemo  = _envBool("DEPLOY_DEMO_TOKEN", false);

        console.log("=== EquityOnChain Protocol Deployment ===");
        console.log("Network    : ", block.chainid == 97 ? "BSC Testnet" : block.chainid == 56 ? "BSC Mainnet" : "Unknown");
        console.log("Deployer   :", deployer);
        console.log("Treasury   :", treasury);
        console.log("Balance    :", deployer.balance / 1e18, "BNB");
        console.log("");

        vm.startBroadcast(deployerKey);

        // ── 1. KYCRegistry ────────────────────────────────────────────────────
        KYCRegistry kyc = new KYCRegistry(deployer);
        console.log("[1/3] KYCRegistry deployed     :", address(kyc));

        // ── 2. EquityExchange ─────────────────────────────────────────────────
        EquityExchange exchange = new EquityExchange(deployer, treasury, LISTING_FEE);
        console.log("[2/3] EquityExchange deployed   :", address(exchange));
        console.log("      Listing fee               :", LISTING_FEE / 1e15, "mBNB");
        console.log("      Treasury                  :", treasury);

        // ── 3. EquityFactory ──────────────────────────────────────────────────
        EquityFactory factory = new EquityFactory(deployer, payable(address(exchange)));
        console.log("[3/3] EquityFactory deployed    :", address(factory));
        console.log("");

        // ── 4. Demo token (optional) ──────────────────────────────────────────
        if (deployDemo) {
            console.log("--- Deploying demo equity token ---");
            uint256 initialBnb = 0.1 ether; // seed 0.1 BNB into the pool
            uint256 totalValue  = LISTING_FEE + initialBnb;

            require(deployer.balance >= totalValue, "Deploy: insufficient BNB for demo listing");

            address tokenAddr = factory.create{value: totalValue}(
                DEMO_NAME,
                DEMO_SYMBOL,
                DEMO_MAX_SUPPLY,
                DEMO_POOL_TOKENS,
                DEMO_FOUNDER_TOKENS,
                demoConfig
            );

            console.log("Demo EquityToken deployed      :", tokenAddr);
            console.log("Demo pool seeded with          : 500,000 DEMO / 0.1 BNB");
            console.log("Founder allocation             : 1,000,000 DEMO");
        }

        vm.stopBroadcast();

        // ── Summary ───────────────────────────────────────────────────────────
        console.log("");
        console.log("=== Deployment Summary ===");
        console.log("KYCRegistry   :", address(kyc));
        console.log("EquityExchange:", address(exchange));
        console.log("EquityFactory :", address(factory));
        console.log("");
        console.log("Next steps:");
        console.log("  1. Set EQUITY_EXCHANGE=", address(exchange), "in your .env");
        console.log("  2. Set EQUITY_FACTORY= ", address(factory),  "in your .env");
        console.log("  3. Set KYC_REGISTRY=   ", address(kyc),      "in your .env");
        console.log("  4. Verify contracts on opBNB explorer");
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    function _envBool(string memory key, bool defaultVal) internal view returns (bool) {
        try vm.envBool(key) returns (bool v) {
            return v;
        } catch {
            return defaultVal;
        }
    }
}
