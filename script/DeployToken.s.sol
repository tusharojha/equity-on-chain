// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {EquityFactory} from "../src/EquityFactory.sol";
import {EquityToken} from "../src/EquityToken.sol";
import {IEquityToken} from "../src/interfaces/IEquityToken.sol";

/// @title DeployToken
/// @notice Lists a new equity token on an already-deployed EquityFactory.
///         Use this after the protocol is live to onboard new companies.
///
/// Required environment variables:
///   DEPLOYER_PRIVATE_KEY  — company / founder private key
///   EQUITY_FACTORY        — address of the deployed EquityFactory
///
/// Token parameters — set these before running or pass via env:
///   TOKEN_NAME, TOKEN_SYMBOL, TOKEN_MAX_SUPPLY (in ether units)
///   POOL_TOKENS, FOUNDER_TOKENS, INITIAL_BNB
///   CIRCUIT_UPPER_PCT, CIRCUIT_LOWER_PCT, CIRCUIT_HALT_BLOCKS
///   LIMIT_OWNERSHIP, MAX_OWNERSHIP_PCT
///   KYC_REQUIRED, KYC_PROVIDER
///
/// Usage:
///   forge script script/DeployToken.s.sol \
///     --rpc-url opbnb_testnet \
///     --broadcast \
///     -vvvv
contract DeployToken is Script {
    function run() external {
        uint256 founderKey  = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address founder     = vm.addr(founderKey);
        address factoryAddr = vm.envAddress("EQUITY_FACTORY");

        EquityFactory factory = EquityFactory(payable(factoryAddr));

        // ── Token parameters (read from env with sensible defaults) ──────────
        string memory name_   = vm.envOr("TOKEN_NAME",   string("My Company"));
        string memory symbol_ = vm.envOr("TOKEN_SYMBOL", string("MYC"));
        uint256 maxSupply_    = vm.envOr("TOKEN_MAX_SUPPLY",  uint256(1_000_000e18));
        uint256 poolTokens    = vm.envOr("POOL_TOKENS",       uint256(100_000e18));
        uint256 founderTokens = vm.envOr("FOUNDER_TOKENS",    uint256(200_000e18));
        uint256 initialBnb    = vm.envOr("INITIAL_BNB",       uint256(0.1 ether));

        IEquityToken.Config memory cfg = IEquityToken.Config({
            upperCircuitPct:   uint8(vm.envOr("CIRCUIT_UPPER_PCT",  uint256(10))),
            lowerCircuitPct:   uint8(vm.envOr("CIRCUIT_LOWER_PCT",  uint256(10))),
            circuitHaltBlocks: vm.envOr("CIRCUIT_HALT_BLOCKS",      uint256(100)),
            limitOwnership:    vm.envOr("LIMIT_OWNERSHIP",          false),
            maxOwnershipPct:   uint8(vm.envOr("MAX_OWNERSHIP_PCT",  uint256(10))),
            kycRequired:       vm.envOr("KYC_REQUIRED",             false),
            kycProvider:       vm.envOr("KYC_PROVIDER",             address(0))
        });

        uint256 listingFee = factory.exchange().listingFee();
        uint256 totalValue = listingFee + initialBnb;

        console.log("=== Listing New Equity Token ===");
        console.log("Factory     :", factoryAddr);
        console.log("Founder     :", founder);
        console.log("Token       :", string.concat(name_, " (", symbol_, ")"));
        console.log("Max supply  :", maxSupply_ / 1e18, "tokens");
        console.log("Pool tokens :", poolTokens / 1e18, "tokens");
        console.log("Founder tok :", founderTokens / 1e18, "tokens");
        console.log("Initial BNB :", initialBnb / 1e15, "mBNB");
        console.log("Listing fee :", listingFee / 1e15, "mBNB");
        console.log("Total BNB   :", totalValue / 1e15, "mBNB");
        console.log("Balance     :", founder.balance / 1e15, "mBNB");
        require(founder.balance >= totalValue, "DeployToken: insufficient BNB");

        vm.startBroadcast(founderKey);

        address tokenAddr = factory.create{value: totalValue}(
            name_,
            symbol_,
            maxSupply_,
            poolTokens,
            founderTokens,
            cfg
        );

        vm.stopBroadcast();

        console.log("");
        console.log("=== Token Listed ===");
        console.log("EquityToken :", tokenAddr);
        console.log("Owner       :", founder);
        console.log("Verify at opBNB explorer and update your frontend .env.");
    }
}
